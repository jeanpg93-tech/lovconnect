// Revendedor marca manualmente que já enviou o PIX de estorno para o cliente.
// Só marca — não movimenta saldo (o estorno do saldo do revendedor acontece
// separadamente em claude-cancel-key). Notifica o cliente e o painel.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { data: reseller } = await admin
      .from("resellers").select("id").eq("user_id", userData.user.id).maybeSingle();
    if (!reseller) return json({ error: "reseller_not_found" }, 404);

    const { data: order } = await admin
      .from("claude_orders")
      .select("id, reseller_id, customer_id, plan_code, customer_refunded_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.reseller_id !== reseller.id) return json({ error: "order_not_found" }, 404);
    if (order.customer_refunded_at) return json({ error: "already_refunded" }, 409);

    const now = new Date().toISOString();
    await admin.from("claude_orders").update({
      customer_refunded_at: now,
      customer_refunded_by: userData.user.id,
      customer_refund_note: note,
    }).eq("id", order.id);

    // Notifica o cliente (se tiver auth_user_id)
    try {
      if (order.customer_id) {
        const { data: customer } = await admin
          .from("claude_customers").select("auth_user_id, name").eq("id", order.customer_id).maybeSingle();
        if (customer?.auth_user_id) {
          await admin.from("notifications").insert({
            user_id: customer.auth_user_id,
            type: "claude_customer_refunded",
            title: "Estorno confirmado",
            body: `Seu revendedor confirmou o envio do estorno via PIX referente ao plano ${order.plan_code}.`,
            metadata: { order_id: order.id, plan_code: order.plan_code },
          });
        }
      }
    } catch (_) {}

    return json({ ok: true, refunded_at: now });
  } catch (e) {
    console.error("[claude-confirm-customer-refund]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});