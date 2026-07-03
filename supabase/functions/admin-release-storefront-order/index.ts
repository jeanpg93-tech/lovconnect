// One-shot admin utility: força a entrega (provider Lovax) de uma venda da
// loja que está travada em `awaiting_balance`. Consome 1 crédito do pacote
// do revendedor, chama o Lovax, atualiza `storefront_orders` e insere um
// `orders` para histórico. Idempotente: só age se status ∈ (awaiting_balance,paid).
//
// Auth: requer JWT de usuário com role `admin` (via has_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function daysFromType(t: string): number {
  switch (t) {
    case "1d": case "pro_1d": return 1;
    case "7d": case "pro_7d": return 7;
    case "15d": case "pro_15d": return 15;
    case "30d": case "pro_30d": return 30;
    case "90d": return 90;
    case "365d": return 365;
    case "lifetime": return 36500;
    default: return 30;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.order_id ?? "");
  if (!orderId) return json({ error: "missing_order_id" }, 400);

  const { data: order } = await admin
    .from("storefront_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json({ error: "order_not_found" }, 404);
  if (order.status === "completed") return json({ ok: true, already_completed: true, license_key: order.license_key });
  if (!["awaiting_balance", "paid"].includes(order.status)) {
    return json({ error: "wrong_status", status: order.status }, 409);
  }
  if (order.product_type && order.product_type !== "extension") {
    return json({ error: "unsupported_product_type", product_type: order.product_type }, 400);
  }

  // Consome 1 crédito do pacote (idempotente por venda: se já existe consume, não duplica)
  const { data: priorConsume } = await admin
    .from("reseller_pack_ledger")
    .select("id")
    .eq("order_id", order.id)
    .in("kind", ["consume", "sale_consume"])
    .maybeSingle();

  let packConsumed = false;
  if (!priorConsume) {
    const { data: c, error: cErr } = await admin.rpc("pack_try_consume_sale_credit", {
      _reseller_id: order.reseller_id,
      _order_id: order.id,
      _description: `Liberação manual (admin): venda ${order.short_code ?? order.id}`,
    });
    if (cErr) return json({ error: "pack_rpc_failed", detail: cErr.message }, 500);
    if (typeof c !== "number" || c < 0) return json({ error: "pack_empty" }, 402);
    packConsumed = true;
  }

  // Chama Lovax
  const { data: settings } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["lovax_api_token", "lovax_base_url"]);
  const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
  const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
    ?? "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

  if (!tk) {
    if (packConsumed) {
      await admin.rpc("pack_refund_credit", {
        _reseller_id: order.reseller_id,
        _order_id: order.id,
        _description: `Estorno (Lovax não configurado): ${order.id}`,
      });
    }
    return json({ error: "lovax_not_configured" }, 500);
  }

  const days = daysFromType(order.license_type);
  let providerData: any = null;
  let providerStatus = 0;
  try {
    const r = await fetch(bs, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate_license",
        payload: {
          customer_name: order.buyer_name,
          days,
          hours: 0,
          minutes: 0,
          max_devices: 1,
        },
      }),
    });
    providerStatus = r.status;
    const txt = await r.text();
    try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
  } catch (e) {
    if (packConsumed) {
      await admin.rpc("pack_refund_credit", {
        _reseller_id: order.reseller_id,
        _order_id: order.id,
        _description: `Estorno (erro rede Lovax): ${order.id}`,
      });
    }
    return json({ error: "provider_network_error", detail: String((e as Error)?.message ?? e) }, 502);
  }

  if (providerStatus < 200 || providerStatus >= 300 || !providerData?.success) {
    if (packConsumed) {
      await admin.rpc("pack_refund_credit", {
        _reseller_id: order.reseller_id,
        _order_id: order.id,
        _description: `Estorno (Lovax ${providerStatus}): ${order.id}`,
      });
    }
    return json({ error: "provider_error", status: providerStatus, body: providerData }, 502);
  }

  const license_key: string | null =
    providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;

  await admin.from("storefront_orders").update({
    status: "completed",
    license_key,
    cost_cents: 0,
    error_message: null,
  }).eq("id", order.id);

  // Remove pending_storefront_charges se existir
  await admin.from("pending_storefront_charges").delete().eq("order_id", order.id);

  // Cria/atualiza cliente
  let customer_id: string | null = null;
  try {
    const { data: existing } = await admin
      .from("reseller_customers")
      .select("id")
      .eq("reseller_id", order.reseller_id)
      .eq("whatsapp", order.buyer_whatsapp)
      .maybeSingle();
    if (existing) {
      customer_id = existing.id;
    } else {
      const { data: created } = await admin
        .from("reseller_customers")
        .insert({
          reseller_id: order.reseller_id,
          whatsapp: order.buyer_whatsapp,
          display_name: order.buyer_name,
        })
        .select("id")
        .single();
      customer_id = created?.id ?? null;
    }
  } catch (e) { console.warn("customer upsert", e); }

  try {
    await admin.from("orders").insert({
      reseller_id: order.reseller_id,
      client_id: null,
      customer_id,
      extension_id: order.extension_id,
      license_type: order.license_type,
      price_cents: 0,
      status: "completed",
      is_test: false,
      license_key,
      provider_response: providerData,
      notes: `Liberação admin (fallback pacote) • ${order.buyer_name} • Recebido R$ ${(Number(order.price_cents) / 100).toFixed(2)}`,
    });
  } catch (e) { console.warn("orders insert", e); }

  return json({ ok: true, license_key, order_id: order.id });
});