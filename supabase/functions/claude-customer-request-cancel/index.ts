// Cliente final solicita ao revendedor o cancelamento da chave Claude.
// Não cancela — apenas marca cancel_requested_at, atualiza status para 'cancel_requested'
// (se ainda estiver 'issued') e notifica o revendedor (Telegram + notification).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REFUND_WINDOW_DAYS = 7;

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    const orderId = String(body?.order_id ?? "").trim();
    const note = body?.note ? String(body.note).slice(0, 500) : null;
    if (!orderId) return json({ error: "missing_order_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: customer } = await admin
      .from("claude_customers")
      .select("id, name, email, reseller_id, whatsapp")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    const { data: order } = await admin
      .from("claude_orders")
      .select("id, plan_code, status, created_at, reseller_id, customer_id, code")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.customer_id !== customer.id) return json({ error: "order_not_found" }, 404);
    if (!["issued", "redeemed"].includes(order.status)) {
      return json({ error: "invalid_status", status: order.status }, 409);
    }

    const createdMs = new Date(order.created_at).getTime();
    const ageDays = (Date.now() - createdMs) / 86_400_000;
    const withinWindow = ageDays <= REFUND_WINDOW_DAYS;

    await admin.from("claude_orders").update({
      cancel_requested_at: new Date().toISOString(),
      cancel_request_note: note,
      // Não trocamos status se já 'redeemed' (perde o histórico)
      ...(order.status === "issued" ? { status: "cancel_requested" as const } : {}),
    }).eq("id", order.id);

    const { data: reseller } = await admin
      .from("resellers")
      .select("display_name, user_id")
      .eq("id", order.reseller_id)
      .maybeSingle();

    const msg =
      `❌ <b>Solicitação de cancelamento Claude</b>\n` +
      `Revendedor: <b>${reseller?.display_name ?? order.reseller_id}</b>\n` +
      `Cliente: <b>${customer.name}</b> (${customer.email})\n` +
      `Plano: <b>${order.plan_code}</b>\n` +
      `Chave: <code>${order.code ?? "—"}</code>\n` +
      `Prazo estorno: <b>${withinWindow ? "dentro dos 7 dias ✅" : "expirado ⚠️ (sem estorno)"}</b>` +
      (note ? `\nObs.: ${note}` : "");
    try { await admin.rpc("telegram_enqueue", { _text: msg }); } catch (_) {}
    try {
      if (reseller?.user_id) {
        await admin.from("notifications").insert({
          user_id: reseller.user_id,
          type: "claude_cancel_request",
          title: "Solicitação de cancelamento Claude",
          body: `${customer.name} pediu cancelamento (${order.plan_code}). ${withinWindow ? "Dentro dos 7 dias — estorno automático." : "Fora do prazo — sem estorno."}`,
          metadata: {
            order_id: order.id,
            plan_code: order.plan_code,
            within_refund_window: withinWindow,
            customer_email: customer.email,
          },
        });
      }
    } catch (_) {}

    return json({
      ok: true,
      order_id: order.id,
      within_refund_window: withinWindow,
      refund_window_days: REFUND_WINDOW_DAYS,
    });
  } catch (e) {
    console.error("[claude-customer-request-cancel]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});