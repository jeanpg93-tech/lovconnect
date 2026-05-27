import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { computeBonus } from "../_shared/promotion.ts";

const MISTIC_BASE = "https://api.misticpay.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

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

    const body = await req.json().catch(() => ({}));
    const amountCents = Number(body.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents < 100) {
      return json({ error: "Valor mínimo R$ 1,00" }, 400);
    }

    // Service-role client for trusted writes
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reseller } = await admin
      .from("resellers")
      .select("id, display_name, activation_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "Apenas revendedores podem recarregar" }, 403);
    if ((reseller as any).activation_status && (reseller as any).activation_status !== "active") {
      return json({ error: "Painel não ativado. Conclua o pagamento de R$ 200 para liberar.", reason: "activation_required" }, 403);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();

    // Calc bonus from tier
    const { data: tier } = await admin.rpc("get_reseller_tier", { _reseller_id: reseller.id });
    const bonusPct = Number(tier?.recharge_bonus_percent ?? 0);
    const tierBonusCents = Math.floor((amountCents * bonusPct) / 100);

    // Bônus de promoção ativa (somado ao bônus de nível)
    const promo = await computeBonus(admin, amountCents);
    const bonusCents = tierBonusCents + promo.bonusCents;
    const promotion_id = promo.promotionId;

    // Create local intent first to get an ID we send as transactionId to MisticPay
    const { data: intent, error: intentErr } = await admin
      .from("recharge_intents")
      .insert({
        reseller_id: reseller.id,
        amount_cents: amountCents,
        bonus_cents: bonusCents,
        promotion_id,
        status: "pending",
        provider: "misticpay",
        payer_name: profile?.display_name ?? reseller.display_name,
        payer_document: body.payer_document ?? null,
      })
      .select()
      .single();
    if (intentErr || !intent) return json({ error: intentErr?.message ?? "intent error" }, 500);

    // Recargas (revendedor → gerente) SEMPRE usam o MisticPay do gerente.
    // O MisticPay do revendedor é exclusivo das vendas da loja pública dele.
    const ci = Deno.env.get("MISTICPAY_CLIENT_ID");
    const cs = Deno.env.get("MISTICPAY_CLIENT_SECRET");
    if (!ci || !cs) return json({ error: "MisticPay do gerente não configurado" }, 500);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;

    const payerDoc = (body.payer_document ?? "00000000000").toString().replace(/\D/g, "");
    const payerName = profile?.display_name ?? reseller.display_name ?? "Revendedor";

    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: amountCents / 100,
        payerName,
        payerDocument: payerDoc,
        transactionId: intent.id,
        description: `Recarga ${reseller.display_name ?? "revendedor"}`,
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("recharge_intents").update({
        status: "failed",
        raw_response: mpJson,
      }).eq("id", intent.id);
      return json({ error: mpJson?.message ?? "Erro MisticPay", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    await admin.from("recharge_intents").update({
      provider_transaction_id: String(d.transactionId ?? ""),
      qr_code_base64: d.qrCodeBase64 ?? null,
      copy_paste: d.copyPaste ?? null,
      raw_response: mpJson,
    }).eq("id", intent.id);

    return json({
      intent_id: intent.id,
      provider_transaction_id: d.transactionId,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: amountCents,
      bonus_cents: bonusCents,
    });
  } catch (e) {
    console.error("misticpay-create-recharge error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
