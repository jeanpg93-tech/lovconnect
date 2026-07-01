// Cliente final solicita renovação de chave Claude.
// Cria um claude_orders com status='renewal_requested' + is_renewal=true
// e notifica o revendedor via Telegram (gerente) para dar continuidade.
// Fase 3 (v1): captura o pedido; a emissão automática após pagamento fica
// para v2 (integração com gateway do revendedor).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PLAN_LABELS: Record<string, string> = {
  "5x_7d": "5x — 7 dias",
  "5x_30d": "5x — 30 dias",
  "20x_30d": "20x — 30 dias",
};
const PLAN_CODES = new Set(Object.keys(PLAN_LABELS));

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const note = body?.note ? String(body.note).slice(0, 500) : null;
    if (!PLAN_CODES.has(planCode)) return json({ error: "invalid_plan_code" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: customer } = await admin
      .from("claude_customers")
      .select("id, name, email, reseller_id, whatsapp")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    // Anti-spam: evita duplicar solicitação pendente do mesmo plano nas últimas 24h
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent } = await admin
      .from("claude_orders")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("plan_code", planCode)
      .eq("is_renewal", true)
      .eq("status", "renewal_requested")
      .gte("created_at", since)
      .maybeSingle();
    if (recent) return json({ error: "already_requested", order_id: recent.id }, 409);

    // Preço de venda atual (para registrar valor esperado no pedido)
    const [{ data: def }, { data: ov }, { data: reseller }] = await Promise.all([
      admin.from("claude_plan_prices").select("cost_cents, sale_price_cents, is_active").eq("plan_code", planCode).maybeSingle(),
      admin.from("claude_reseller_price_overrides").select("markup_mode, markup_value_cents, is_active").eq("reseller_id", customer.reseller_id).eq("plan_code", planCode).maybeSingle(),
      admin.from("resellers").select("display_name, claude_enabled").eq("id", customer.reseller_id).maybeSingle(),
    ]);
    if (!def?.is_active) return json({ error: "plan_not_active" }, 400);
    if (!reseller?.claude_enabled) return json({ error: "reseller_disabled" }, 403);
    let sale = def.sale_price_cents;
    if (ov && ov.is_active) {
      if (ov.markup_mode === "percent") sale = Math.max(0, Math.round((def.cost_cents * (10000 + ov.markup_value_cents)) / 10000));
      else if (ov.markup_mode === "fixed_add") sale = Math.max(0, def.cost_cents + ov.markup_value_cents);
      else sale = Math.max(0, ov.markup_value_cents);
    }

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
        sale_price_cents: sale,
        profit_cents: sale - def.cost_cents,
        status: "renewal_requested",
        is_renewal: true,
        renewal_note: note,
      })
      .select()
      .single();
    if (oErr) throw oErr;

    // Notifica o gerente (Telegram global) e cria uma notification interna para o revendedor
    const msg =
      `🔄 <b>Solicitação de renovação Claude</b>\n` +
      `Revendedor: <b>${reseller?.display_name ?? customer.reseller_id}</b>\n` +
      `Cliente: <b>${customer.name}</b> (${customer.email})\n` +
      `Plano: <b>${PLAN_LABELS[planCode]}</b>\n` +
      `Valor: <b>${fmtBRL(sale)}</b>` +
      (note ? `\nObs.: ${note}` : "");
    try { await admin.rpc("telegram_enqueue", { _text: msg }); } catch (_) {}
    try {
      await admin.from("notifications").insert({
        user_id: null,
        reseller_id: customer.reseller_id,
        kind: "claude_renewal_request",
        title: "Solicitação de renovação Claude",
        message: `${customer.name} solicitou renovação (${PLAN_LABELS[planCode]}).`,
        data: { order_id: order.id, plan_code: planCode, sale_price_cents: sale, customer_email: customer.email },
      });
    } catch (_) {}

    return json({ ok: true, order_id: order.id, sale_price_cents: sale });
  } catch (e) {
    console.error("[claude-customer-request-renewal]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});