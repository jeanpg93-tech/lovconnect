// Cria cobrança Pix MisticPay para o revendedor comprar um pacote de créditos.
// Após pagamento confirmado pelo webhook (misticpay-webhook), os créditos são liberados.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTIC_BASE = "https://api.misticpay.com/api";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getManagerMisticCreds(admin: any): Promise<{ ci: string | null; cs: string | null }> {
  let ci = Deno.env.get("MISTICPAY_CLIENT_ID") ?? null;
  let cs = Deno.env.get("MISTICPAY_CLIENT_SECRET") ?? null;
  if (ci && cs) return { ci, cs };
  try {
    const { data } = await admin.from("app_settings")
      .select("key, value")
      .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
    for (const row of (data ?? []) as any[]) {
      const v = typeof row.value === "string" ? row.value : (row.value?.value ?? row.value);
      if (row.key === "misticpay_client_id" && !ci) ci = v ?? null;
      if (row.key === "misticpay_client_secret" && !cs) cs = v ?? null;
    }
  } catch {}
  return { ci, cs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const pack_id = String(body.pack_id ?? "");
    if (!pack_id) return json({ error: "pack_id obrigatório" }, 400);

    // Valida revendedor
    const { data: reseller } = await admin
      .from("resellers")
      .select("id, display_name, user_id, billing_mode")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    if ((reseller as any).billing_mode !== "pack") {
      return json({ error: "Modo Pack não habilitado para este revendedor" }, 403);
    }

    // Carrega pacote
    const { data: pack } = await admin
      .from("license_packs")
      .select("id, name, credits, price_cents, is_active")
      .eq("id", pack_id)
      .maybeSingle();
    if (!pack || !(pack as any).is_active) return json({ error: "Pacote indisponível" }, 404);

    const { data: prof } = await admin
      .from("profiles").select("display_name, email")
      .eq("id", (reseller as any).user_id).maybeSingle();
    const payerName = prof?.display_name ?? (reseller as any).display_name ?? "Revendedor";
    const payerDoc = String(body.payer_document ?? "00000000000").replace(/\D/g, "");

    // Cria registro de compra pendente
    const { data: purchase, error: insErr } = await admin
      .from("reseller_pack_purchases")
      .insert({
        reseller_id: (reseller as any).id,
        pack_id: (pack as any).id,
        pack_name: (pack as any).name,
        credits: (pack as any).credits,
        price_cents: (pack as any).price_cents,
        status: "pending",
        provider: "misticpay",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (insErr || !purchase) return json({ error: insErr?.message ?? "insert error" }, 500);

    const { ci, cs } = await getManagerMisticCreds(admin);
    if (!ci || !cs) {
      await admin.from("reseller_pack_purchases")
        .update({ status: "cancelled" })
        .eq("id", (purchase as any).id);
      return json({ error: "MisticPay do gerente não configurado" }, 500);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/misticpay-webhook`;
    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: (pack as any).price_cents / 100,
        payerName,
        payerDocument: payerDoc,
        transactionId: (purchase as any).id,
        description: `Pack ${(pack as any).name} (${(pack as any).credits} créditos) — ${(reseller as any).display_name ?? ""}`.trim(),
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("reseller_pack_purchases").update({ status: "cancelled" }).eq("id", (purchase as any).id);
      return json({ error: mpJson?.message ?? "Erro MisticPay", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    await admin.from("reseller_pack_purchases").update({
      provider_tx_id: String(d.transactionId ?? ""),
      pix_qr_code: d.qrCodeBase64 ?? null,
      pix_copy_paste: d.copyPaste ?? null,
    }).eq("id", (purchase as any).id);

    return json({
      purchase_id: (purchase as any).id,
      provider_transaction_id: d.transactionId,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: (pack as any).price_cents,
      credits: (pack as any).credits,
      pack_name: (pack as any).name,
    });
  } catch (e: any) {
    console.error("pack-create-purchase error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});