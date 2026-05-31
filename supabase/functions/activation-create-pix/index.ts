import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const MISTIC_BASE = "https://api.misticpay.com/api";
const ACTIVATION_BASE_CENTS = 20000;
const PIX_TTL_MINUTES = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reseller } = await admin
      .from("resellers")
      .select("id, display_name, activation_status, billing_mode")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "Apenas revendedores podem ativar o painel" }, 403);

    if (reseller.activation_status === "active") {
      return json({ error: "Painel já está ativo" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const forceNew = !!body.force_new;

    // Reaproveita PIX pendente não expirado
    if (!forceNew) {
      const { data: existing } = await admin
        .from("activation_payments")
        .select("*")
        .eq("reseller_id", reseller.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && existing.expires_at && new Date(existing.expires_at) > new Date() && existing.copy_paste) {
        return json({
          payment_id: existing.id,
          qr_code_base64: existing.qr_code_base64,
          copy_paste: existing.copy_paste,
          amount_cents: existing.amount_cents,
          expires_at: existing.expires_at,
          reused: true,
        });
      }
      // Expira o anterior se houver
      if (existing) {
        await admin.from("activation_payments")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
    } else {
      // Cancela todos os pendentes anteriores
      await admin.from("activation_payments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("reseller_id", reseller.id)
        .eq("status", "pending");
    }

    const { data: profile } = await admin
      .from("profiles").select("display_name, email").eq("id", userId).maybeSingle();

    const expiresAt = new Date(Date.now() + PIX_TTL_MINUTES * 60 * 1000).toISOString();

    // Pricing dinâmico com promoção de adesão ativa (se houver)
    let finalCents = ACTIVATION_BASE_CENTS;
    let bonusCents = 0;
    let promotionId: string | null = null;
    // Promo de adesão só vale para revendedores "normais" (não mensalistas/packs)
    const eligibleForPromo = (reseller as any).billing_mode === "normal" || !(reseller as any).billing_mode;
    if (eligibleForPromo) try {
      const { data: pricing } = await admin.rpc("compute_activation_pricing", { _base_cents: ACTIVATION_BASE_CENTS });
      const row: any = Array.isArray(pricing) ? pricing[0] : pricing;
      if (row) {
        finalCents = Number(row.final_price_cents ?? ACTIVATION_BASE_CENTS);
        bonusCents = Number(row.bonus_cents ?? 0);
        promotionId = row.promotion_id ?? null;
      }
    } catch (e) {
      console.warn("compute_activation_pricing fallback:", e);
    }
    if (!Number.isFinite(finalCents) || finalCents < 100) finalCents = ACTIVATION_BASE_CENTS;

    const { data: intent, error: intentErr } = await admin
      .from("activation_payments")
      .insert({
        reseller_id: reseller.id,
        amount_cents: finalCents,
        original_amount_cents: ACTIVATION_BASE_CENTS,
        bonus_cents: bonusCents,
        promotion_id: promotionId,
        status: "pending",
        provider: "misticpay",
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (intentErr || !intent) return json({ error: intentErr?.message ?? "intent error" }, 500);

    const ci = Deno.env.get("MISTICPAY_CLIENT_ID");
    const cs = Deno.env.get("MISTICPAY_CLIENT_SECRET");
    if (!ci || !cs) return json({ error: "Gateway de pagamento não configurado" }, 500);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;
    const payerName = profile?.display_name ?? reseller.display_name ?? "Revendedor";
    const payerDoc = String(body.payer_document ?? "00000000000").replace(/\D/g, "");

    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: finalCents / 100,
        payerName,
        payerDocument: payerDoc,
        transactionId: intent.id,
        description: `Ativação Painel Revendedor`,
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("activation_payments")
        .update({ status: "cancelled", raw_response: mpJson })
        .eq("id", intent.id);
      return json({ error: mpJson?.message ?? "Erro no gateway", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    await admin.from("activation_payments").update({
      provider_transaction_id: String(d.transactionId ?? intent.id),
      qr_code_base64: d.qrCodeBase64 ?? null,
      copy_paste: d.copyPaste ?? null,
      raw_response: mpJson,
    }).eq("id", intent.id);

    await admin.from("activation_logs").insert({
      reseller_id: reseller.id,
      event: "pix_generated",
      actor_id: userId,
      metadata: { payment_id: intent.id },
    });

    return json({
      payment_id: intent.id,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: finalCents,
      original_amount_cents: ACTIVATION_BASE_CENTS,
      bonus_cents: bonusCents,
      promotion_id: promotionId,
      expires_at: expiresAt,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal" }, 500);
  }
});