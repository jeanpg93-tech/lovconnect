// Cliente final solicita ao revendedor o cancelamento da chave Claude.
// Não cancela — apenas marca cancel_requested_at, atualiza status para 'cancel_requested'
// (se ainda estiver 'issued') e notifica o revendedor (WhatsApp via Evolution, se
// configurado, + notificação no painel). Revendedores NÃO usam Telegram.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_BASE = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const REFUND_WINDOW_DAYS = 7;

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function instanceTokenFor(resellerId: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`lovconnect:evolution-go:${resellerId}`),
  );
  const chars = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeBrPhone(raw: string): string | null {
  const d = (raw ?? "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return "55" + d;
  if (d.length >= 12) return d;
  return null;
}

async function notifyResellerWhatsapp(admin: any, resellerId: string, text: string) {
  if (!EVO_BASE || !EVO_KEY) return { skipped: "evolution_not_configured" };
  const { data: integ } = await admin
    .from("reseller_integrations")
    .select("evolution_enabled, evolution_instance, connection_status")
    .eq("reseller_id", resellerId)
    .maybeSingle();
  if (!integ?.evolution_enabled || !integ.evolution_instance || integ.connection_status !== "connected") {
    return { skipped: "not_enabled_or_not_connected" };
  }
  const { data: r } = await admin.from("resellers").select("user_id, is_demo").eq("id", resellerId).maybeSingle();
  if (r?.is_demo) return { skipped: "demo_account" };
  if (!r?.user_id) return { skipped: "no_reseller_user" };
  const { data: prof } = await admin
    .from("profiles").select("whatsapp, phone").eq("id", r.user_id).maybeSingle();
  const to = normalizeBrPhone(prof?.whatsapp ?? prof?.phone ?? "");
  if (!to) return { skipped: "reseller_has_no_phone" };
  const token = await instanceTokenFor(resellerId);
  try {
    const resp = await fetch(`${EVO_BASE}/send/text`, {
      method: "POST",
      headers: { apikey: token, "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, text }),
    });
    if (!resp.ok) {
      const resp2 = await fetch(`${EVO_BASE}/message/sendText/${encodeURIComponent(integ.evolution_instance)}`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: to, text }),
      });
      return resp2.ok ? { ok: true, via: "legacy" } : { skipped: "send_failed" };
    }
    return { ok: true, via: "evolution-go" };
  } catch (e) {
    return { skipped: "send_error", error: String(e) };
  }
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
    const orderId = String(body?.order_id ?? "").trim();
    const note = body?.note ? String(body.note).slice(0, 500) : null;
    const pixFullName = body?.pix_full_name ? String(body.pix_full_name).trim().slice(0, 120) : null;
    const pixKey = body?.pix_key ? String(body.pix_key).trim().slice(0, 200) : null;
    const pixKeyType = body?.pix_key_type ? String(body.pix_key_type).trim().slice(0, 20) : null;
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
      customer_refund_full_name: pixFullName,
      customer_refund_pix_key: pixKey,
      customer_refund_pix_key_type: pixKeyType,
      // Não trocamos status se já 'redeemed' (perde o histórico)
      ...(order.status === "issued" ? { status: "cancel_requested" as const } : {}),
    }).eq("id", order.id);

    const { data: reseller } = await admin
      .from("resellers")
      .select("display_name, user_id")
      .eq("id", order.reseller_id)
      .maybeSingle();

    const waText =
      `❌ *Solicitação de cancelamento Claude*\n` +
      `Cliente: *${customer.name}* (${customer.email})\n` +
      `Plano: *${order.plan_code}*\n` +
      `Chave: ${order.code ?? "—"}\n` +
      `Prazo estorno: *${withinWindow ? "dentro dos 7 dias ✅" : "expirado ⚠️ (sem estorno)"}*` +
      (withinWindow && pixKey
        ? `\n\n💸 *Dados para estorno via PIX:*\n` +
          `Nome: *${pixFullName ?? "—"}*\n` +
          `Tipo: *${pixKeyType ?? "—"}*\n` +
          `Chave: \`${pixKey}\``
        : "") +
      (note ? `\nObs.: ${note}` : "");
    try { await notifyResellerWhatsapp(admin, order.reseller_id, waText); } catch (_) {}
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
            pix_full_name: pixFullName,
            pix_key: pixKey,
            pix_key_type: pixKeyType,
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