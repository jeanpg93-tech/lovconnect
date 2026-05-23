import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PENDING_STATUSES = ["aguardando", "pending", "processando"];

const PROVIDER_BASE = "https://lojinhalovable.com/api/v1/revenda";

// Solicita estorno no provedor da Lojinha (fire-and-forget).
// Não bloqueia o cancelamento se falhar — apenas registra em provider_response.
async function requestProviderRefund(admin: any, purchaseId: string) {
  try {
    const { data: p } = await admin
      .from("reseller_credit_purchases")
      .select("id, provider_pedido_id, status, provider_response")
      .eq("id", purchaseId)
      .maybeSingle();
    if (!p) return;
    const providerId = p.provider_pedido_id;
    if (!providerId) return;
    if (String(p.status ?? "").startsWith("manual_")) return;
    const prev = (p.provider_response ?? {}) as any;
    if (prev?.provider_refund_requested_at) return; // dedupe

    const { data: master } = await admin
      .from("app_settings").select("value")
      .eq("key", "lovable_credits_master").maybeSingle();
    const apiKey = (master as any)?.value?.api_key;
    if (!apiKey) return;

    let ok = false, statusCode = 0, body: any = null, errMsg: string | null = null;
    try {
      const r = await fetch(`${PROVIDER_BASE}/pedidos/${providerId}/reembolso`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      });
      statusCode = r.status;
      const text = await r.text();
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      ok = r.ok && body?.success !== false;
    } catch (e: any) {
      errMsg = e?.message ?? "fetch_failed";
    }

    await admin.from("reseller_credit_purchases").update({
      provider_response: {
        ...prev,
        provider_refund_requested_at: new Date().toISOString(),
        provider_refund_ok: ok,
        provider_refund_status_code: statusCode,
        provider_refund_response: body,
        provider_refund_error: errMsg,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", purchaseId);
  } catch (_e) {
    // silencioso — estorno no provedor é independente
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const purchaseId = typeof body?.purchase_id === "string" ? body.purchase_id : null;
    if (!purchaseId) return json({ error: "missing_purchase_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Validate user
    const { data: userData, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    // Resolve reseller owned by user
    const { data: reseller } = await admin
      .from("resellers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "reseller_not_found" }, 404);

    // Load purchase
    const { data: purchase, error: perr } = await admin
      .from("reseller_credit_purchases")
      .select("id, status, reseller_id")
      .eq("id", purchaseId)
      .maybeSingle();
    if (perr) return json({ error: perr.message }, 500);
    if (!purchase) return json({ error: "purchase_not_found" }, 404);
    if (purchase.reseller_id !== reseller.id) return json({ error: "forbidden" }, 403);

    if (!PENDING_STATUSES.includes(String(purchase.status))) {
      return json(
        { error: "cannot_cancel", reason: "Compra só pode ser cancelada antes do pagamento" },
        409,
      );
    }

    const { error: updErr } = await admin
      .from("reseller_credit_purchases")
      .update({
        status: "cancelado",
        error_message: "Cancelado pelo revendedor antes do pagamento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId)
      .in("status", PENDING_STATUSES);
    if (updErr) return json({ error: updErr.message }, 500);

    // Dispara estorno automático no provedor da Lojinha (não bloqueia)
    await requestProviderRefund(admin, purchaseId);

    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});