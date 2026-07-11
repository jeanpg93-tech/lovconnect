// One-shot: reissue Claude key for order ac03cf71-1c74-467b-a886-ffd774ef8b8b
// after provider balance was topped up. Safe: only operates on this exact ID
// and only if status is 'awaiting_balance' or 'failed'.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ORDER_ID = "ac03cf71-1c74-467b-a886-ffd774ef8b8b";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY")!;
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const svc = createClient(SUPABASE_URL, SRK);
  const { data: order, error } = await svc.from("claude_orders").select("*").eq("id", ORDER_ID).maybeSingle();
  if (error || !order) return j({ error: "not_found", details: error }, 404);
  if (order.status !== "awaiting_balance" && order.status !== "failed") {
    return j({ error: "invalid_status", status: order.status }, 400);
  }

  // Resolve reseller cost
  const { data: def } = await svc.from("claude_plan_prices")
    .select("cost_cents, reseller_cost_cents, sale_price_cents").eq("plan_code", order.plan_code).maybeSingle();
  const fallback = (def as any)?.reseller_cost_cents ?? (def as any)?.sale_price_cents ?? order.cost_cents ?? 0;
  let cost = fallback;
  try {
    const { data } = await svc.rpc("get_reseller_claude_cost", { _reseller_id: order.reseller_id, _plan_code: order.plan_code });
    if (typeof data === "number" && data > 0) cost = data;
  } catch { /* ignore */ }

  // Debit reseller
  const { data: debited, error: dErr } = await svc.rpc("debit_reseller_balance", {
    _reseller_id: order.reseller_id,
    _amount_cents: cost,
    _kind: "claude_key_issue",
    _description: `Reprocessamento pedido Claude ${order.plan_code} (${ORDER_ID})`,
    _reference_id: order.id,
  });
  if (dErr || debited !== true) return j({ error: "debit_failed", details: dErr, debited }, 402);

  // Call provider
  const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ kind: order.plan_code, ...(order.customer_email ? { email: String(order.customer_email).toLowerCase() } : {}) }),
  });
  const txt = await r.text();
  let parsed: any = null; try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
  if (r.status < 200 || r.status >= 300) {
    await svc.rpc("credit_reseller_balance", {
      _reseller_id: order.reseller_id,
      _amount_cents: cost,
      _kind: "claude_key_issue_refund",
      _description: `Estorno reprocessamento ${ORDER_ID} (provider ${r.status})`,
      _reference_id: order.id,
    });
    await svc.from("claude_orders").update({ status: "failed", provider_response: parsed, error_message: `provider_${r.status}` }).eq("id", order.id);
    return j({ error: "provider_error", status: r.status, body: parsed }, 502);
  }

  const code = parsed?.code ?? parsed?.key ?? parsed?.data?.code ?? parsed?.data?.key;
  const pkid = parsed?.id ?? parsed?.key_id ?? parsed?.data?.id;
  const pak = parsed?.apiKey ?? parsed?.api_key ?? parsed?.data?.apiKey ?? parsed?.data?.api_key;
  const puid = parsed?.userId ?? parsed?.user_id ?? parsed?.data?.userId ?? parsed?.data?.user_id;

  await svc.from("claude_orders").update({
    status: "issued",
    code, provider_key_id: pkid, provider_api_key: pak ?? null, provider_user_id: puid ?? null,
    provider_response: parsed, code_revealed_at: new Date().toISOString(), error_message: null,
  }).eq("id", order.id);

  return j({ ok: true, code, provider_key_id: pkid, cost_debited_cents: cost });
});