import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const svc = createClient(SUPA_URL, SERVICE);

  // gerente?
  const { data: roleOk } = await svc.rpc("has_role", { _user_id: userId, _role: "gerente" });
  if (!roleOk) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const tipo = body?.tipo;
  const refId = String(body?.provider_pedido_id ?? "").trim();
  const observacao = body?.observacao ? String(body.observacao).slice(0, 500) : null;

  if (tipo !== "credits" && tipo !== "license") return json({ error: "tipo inválido" }, 400);
  if (!refId) return json({ error: "provider_pedido_id obrigatório" }, 400);

  try {
    if (tipo === "credits") {
      const { data: purchase, error: pErr } = await svc
        .from("reseller_credit_purchases")
        .select("id, reseller_id, price_cents, status, credits, provider_pedido_id")
        .eq("provider_pedido_id", refId)
        .maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!purchase) return json({ error: "Pedido não encontrado" }, 404);
      if (purchase.status === "estornado") return json({ error: "Pedido já estornado" }, 409);
      if (!purchase.price_cents || purchase.price_cents <= 0)
        return json({ error: "Pedido sem valor para estornar" }, 400);

      const { error: uErr } = await svc
        .from("reseller_credit_purchases")
        .update({ status: "estornado" })
        .eq("id", purchase.id);
      if (uErr) return json({ error: uErr.message }, 500);

      const { error: cErr } = await svc.rpc("credit_reseller_balance", {
        _reseller_id: purchase.reseller_id,
        _amount_cents: purchase.price_cents,
        _kind: "credit_purchase_refund",
        _description: `Estorno do pedido ${refId}${observacao ? ` - ${observacao}` : ""}`,
        _reference_id: purchase.id,
      });
      if (cErr) return json({ error: cErr.message }, 500);

      await svc.from("admin_audit_logs").insert({
        user_id: userId,
        action: "refund_sale",
        details: { tipo, provider_pedido_id: refId, price_cents: purchase.price_cents, reseller_id: purchase.reseller_id, observacao },
      });

      return json({ ok: true, refunded_cents: purchase.price_cents });
    }

    // tipo === "license"
    // refId pode ser license_key OU UUID do order. Tenta ambos.
    let order: any = null;
    const tryOrder = await svc
      .from("orders")
      .select("id, reseller_id, price_cents, status, license_key")
      .or(`license_key.eq.${refId},id.eq.${refId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    order = tryOrder.data;

    if (!order) return json({ error: "Pedido de licença não encontrado" }, 404);
    if (!order.price_cents || order.price_cents <= 0)
      return json({ error: "Pedido sem valor para estornar" }, 400);

    const { data: existing } = await svc
      .from("balance_transactions")
      .select("id")
      .eq("kind", "license_purchase_refund")
      .eq("reference_id", order.id)
      .limit(1);
    if (existing && existing.length > 0) return json({ error: "Licença já estornada" }, 409);

    const { error: cErr } = await svc.rpc("credit_reseller_balance", {
      _reseller_id: order.reseller_id,
      _amount_cents: order.price_cents,
      _kind: "license_purchase_refund",
      _description: `Estorno da licença ${order.license_key ?? order.id}${observacao ? ` - ${observacao}` : ""}`,
      _reference_id: order.id,
    });
    if (cErr) return json({ error: cErr.message }, 500);

    await svc.from("admin_audit_logs").insert({
      user_id: userId,
      action: "refund_sale",
      details: { tipo, order_id: order.id, license_key: order.license_key, price_cents: order.price_cents, reseller_id: order.reseller_id, observacao },
    });

    return json({ ok: true, refunded_cents: order.price_cents });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});