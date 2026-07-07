// Cliente final gera PIX para renovar chave Claude.
// Cria claude_orders (status='awaiting_payment', is_renewal=true) e usa o
// MisticPay do PRÓPRIO revendedor (mesmas creds da loja pública) para gerar o QR.
// O misticpay-webhook confirma o pagamento e chama a emissão da chave.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MISTIC_BASE = "https://api.misticpay.com/api";

const PLAN_LABELS: Record<string, string> = {
  "pro_30d": "Pro — 30 dias",
  "5x_30d": "5x — 30 dias",
  "20x_30d": "20x — 30 dias",
  "api_500k_30d": "API 500K · 30 dias",
  "api_25m_30d": "API 2,5M · 30 dias",
  "api_10m_30d": "API 10M · 30 dias",
};
const PLAN_CODES = new Set(Object.keys(PLAN_LABELS));

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function computeSalePrice(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const planCode = String(body?.plan_code ?? "").trim();
    const payerDocument = String(body?.payer_document ?? "00000000000").replace(/\D/g, "");
    const resellerSlug = String(body?.reseller_slug ?? "").trim().toLowerCase();
    const resellerIdIn = String(body?.reseller_id ?? "").trim();
    if (!PLAN_CODES.has(planCode)) return json({ error: "invalid_plan_code" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let scopedResellerId = resellerIdIn || "";
    if (resellerSlug && !scopedResellerId) {
      const { data: scopedReseller } = await admin
        .from("resellers")
        .select("id")
        .eq("slug", resellerSlug)
        .maybeSingle();
      scopedResellerId = scopedReseller?.id ?? "";
    }
    if ((resellerSlug || resellerIdIn) && !scopedResellerId) return json({ error: "customer_not_found" }, 404);

    let customerQuery = admin
      .from("claude_customers")
      .select("id, name, email, whatsapp, reseller_id")
      .eq("auth_user_id", userData.user.id);
    if (scopedResellerId) customerQuery = customerQuery.eq("reseller_id", scopedResellerId);
    const { data: customer } = await customerQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    // Anti-spam: reaproveita pedido awaiting_payment ainda válido
    const nowIso = new Date().toISOString();
    const { data: existing } = await admin
      .from("claude_orders")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("plan_code", planCode)
      .eq("status", "awaiting_payment")
      .eq("is_renewal", true)
      .gt("pix_expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return json({
        ok: true,
        reused: true,
        order_id: existing.id,
        provider_transaction_id: existing.provider_transaction_id,
        qr_code_base64: existing.qr_code_base64,
        copy_paste: existing.copy_paste,
        pix_expires_at: existing.pix_expires_at,
        sale_price_cents: existing.sale_price_cents,
      });
    }

    // Reseller + preço
    const [{ data: reseller }, { data: def }, { data: ov }] = await Promise.all([
      admin.from("resellers").select("id, display_name, claude_enabled").eq("id", customer.reseller_id).maybeSingle(),
      admin.from("claude_plan_prices").select("cost_cents, sale_price_cents, is_active").eq("plan_code", planCode).maybeSingle(),
      admin.from("claude_reseller_price_overrides").select("markup_mode, markup_value_cents, is_active").eq("reseller_id", customer.reseller_id).eq("plan_code", planCode).maybeSingle(),
    ]);
    if (!reseller?.claude_enabled) return json({ error: "reseller_disabled" }, 403);
    if (!def?.is_active) return json({ error: "plan_not_active" }, 400);

    let saleCents = def.sale_price_cents;
    if (ov && ov.is_active) saleCents = computeSalePrice(def.cost_cents, ov.markup_mode, ov.markup_value_cents);
    if (saleCents <= 0) return json({ error: "invalid_price" }, 400);

    // Credenciais MisticPay do revendedor (mesmas da loja pública)
    const { data: integ } = await admin
      .from("reseller_integrations")
      .select("misticpay_client_id, misticpay_client_secret")
      .eq("reseller_id", customer.reseller_id)
      .maybeSingle();
    const ci = integ?.misticpay_client_id;
    const cs = integ?.misticpay_client_secret;
    if (!ci || !cs) return json({ error: "reseller_misticpay_not_configured" }, 400);

    // Cria pedido pendente
    const { data: order, error: oErr } = await admin
      .from("claude_orders")
      .insert({
        reseller_id: customer.reseller_id,
        customer_id: customer.id,
        customer_email: customer.email,
        customer_name: customer.name,
        customer_whatsapp: customer.whatsapp,
        plan_code: planCode,
        cost_cents: def.cost_cents,
        sale_price_cents: saleCents,
        profit_cents: saleCents - def.cost_cents,
        status: "awaiting_payment",
        is_renewal: true,
      })
      .select()
      .single();
    if (oErr || !order) return json({ error: oErr?.message ?? "order_insert_failed" }, 500);

    // Gera PIX no MisticPay do revendedor
    const webhookUrl = `${SUPABASE_URL}/functions/v1/misticpay-webhook`;
    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: saleCents / 100,
        payerName: customer.name,
        payerDocument: payerDocument || "00000000000",
        transactionId: order.id,
        description: `Renovação Claude ${PLAN_LABELS[planCode]}`,
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("claude_orders").update({
        status: "failed",
        error_message: `misticpay_${mpResp.status}`,
        provider_response: mpJson,
      }).eq("id", order.id);
      return json({ error: mpJson?.message ?? "misticpay_error", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const { data: updated } = await admin
      .from("claude_orders")
      .update({
        provider_transaction_id: String(d.transactionId ?? order.id),
        qr_code_base64: d.qrCodeBase64 ?? null,
        copy_paste: d.copyPaste ?? null,
        pix_expires_at: expiresAt,
        provider_response: mpJson,
      })
      .eq("id", order.id)
      .select()
      .single();

    return json({
      ok: true,
      order_id: order.id,
      provider_transaction_id: updated?.provider_transaction_id,
      qr_code_base64: updated?.qr_code_base64,
      copy_paste: updated?.copy_paste,
      pix_expires_at: updated?.pix_expires_at,
      sale_price_cents: saleCents,
    });
  } catch (e) {
    console.error("[claude-customer-checkout-renewal]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});