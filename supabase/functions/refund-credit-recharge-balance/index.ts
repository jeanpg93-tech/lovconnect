// Credita de volta no saldo do revendedor o valor da recarga cancelada.
// Só permitido se:
//   - cancellation_status = 'client_refunded'
//   - balance_refunded_at IS NULL

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: cErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const sale_type = String(body.sale_type ?? "");
  const sale_id = typeof body.sale_id === "string" ? body.sale_id : "";
  if (!["storefront", "manual"].includes(sale_type)) return json({ error: "invalid_sale_type" }, 400);
  if (!sale_id) return json({ error: "missing_sale_id" }, 400);

  const { data: reseller } = await svc.from("resellers")
    .select("id, is_active").eq("user_id", userId).maybeSingle();
  if (!reseller || !reseller.is_active) return json({ error: "reseller_inactive" }, 403);

  const table = sale_type === "storefront" ? "storefront_orders" : "reseller_credit_purchases";
  const { data: sale } = await svc
    .from(table)
    .select("*")
    .eq("id", sale_id)
    .eq("reseller_id", reseller.id)
    .maybeSingle();
  if (!sale) return json({ error: "sale_not_found" }, 404);

  if (sale.cancellation_status !== "client_refunded") {
    return json({
      error: "wrong_status",
      message: "O reembolso ao cliente precisa estar concluído antes de devolver o saldo.",
      cancellation_status: sale.cancellation_status,
    }, 409);
  }
  if (sale.balance_refunded_at) {
    return json({ error: "already_refunded" }, 409);
  }

  // storefront usa cost_cents; manual usa price_cents (o que foi debitado).
  const amount = sale_type === "storefront"
    ? Number(sale.cost_cents ?? 0)
    : Number(sale.price_cents ?? 0);

  if (!amount || amount <= 0) {
    await svc.from(table).update({
      cancellation_status: "balance_refunded",
      balance_refunded_at: new Date().toISOString(),
      status: "cancelado",
    }).eq("id", sale.id);
    return json({ ok: true, refunded_cents: 0, note: "no_amount_to_refund" });
  }

  const kind = "credit_recharge_refund";
  const desc = sale_type === "storefront"
    ? `Estorno recarga Loja #${sale.short_code ?? sale.id}`
    : `Estorno recarga ${sale.credits ?? ""} créditos`;

  const { error: cErr2 } = await svc.rpc("credit_reseller_balance", {
    _reseller_id: reseller.id,
    _amount_cents: amount,
    _kind: kind,
    _description: desc,
    _reference_id: sale.id,
  });
  if (cErr2) return json({ error: cErr2.message }, 500);

  await svc.from(table).update({
    cancellation_status: "balance_refunded",
    balance_refunded_at: new Date().toISOString(),
    status: "cancelado",
  }).eq("id", sale.id);

  return json({ ok: true, refunded_cents: amount });
});