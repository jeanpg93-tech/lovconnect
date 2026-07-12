// Devolve ao revendedor a mesma origem que foi usada na venda:
// saldo da carteira volta para saldo; Pack volta como 1 licença no Pack.
// Só permitido se:
//   - cancellation_status IN ('client_refunded')
//   - key_revoked_at IS NOT NULL (chave de fato revogada)
//   - balance_refunded_at IS NULL (não creditado ainda)

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

function parseNotes(raw: unknown): any | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
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

  const table = sale_type === "storefront" ? "storefront_orders" : "orders";
  const { data: sale } = await svc
    .from(table)
    .select("*")
    .eq("id", sale_id)
    .eq("reseller_id", reseller.id)
    .maybeSingle();
  if (!sale) return json({ error: "sale_not_found" }, 404);

  // `orders` recebe um espelho das vendas da Loja. Se a venda veio da Loja,
  // a fonte real do débito é o registro em storefront_orders. Redireciona o
  // estorno para ele para impedir crédito indevido em saldo quando a origem foi Pack.
  if (sale_type === "manual") {
    const notesObj = parseNotes(sale.notes);
    const storefrontOrderId = typeof notesObj?.storefront_order_id === "string"
      ? notesObj.storefront_order_id
      : null;
    if (notesObj?.source === "storefront" && storefrontOrderId) {
      return json({
        error: "storefront_mirror_order",
        message: "Esta licença veio da Loja Pública. Use o pedido da Loja para devolver saldo/Pack corretamente.",
        storefront_order_id: storefrontOrderId,
        storefront_short_code: notesObj?.storefront_short_code ?? null,
      }, 409);
    }
  }

  if (sale.cancellation_status !== "client_refunded") {
    return json({
      error: "wrong_status",
      message: "O reembolso ao cliente precisa estar concluído antes de devolver o saldo.",
      cancellation_status: sale.cancellation_status,
    }, 409);
  }
  if (!sale.key_revoked_at) {
    return json({
      error: "key_not_revoked",
      message: "A chave precisa estar revogada antes de devolver o saldo.",
    }, 409);
  }
  if (sale.balance_refunded_at) {
    return json({ error: "already_refunded" }, 409);
  }

  // Valor a creditar: storefront usa cost_cents (custo do revendedor),
  // manual/API (orders) usa price_cents (o que foi debitado na geração).
  const amount = sale_type === "storefront"
    ? Number(sale.cost_cents ?? 0)
    : Number(sale.price_cents ?? 0);

  // Detecta se essa venda foi paga via PACK (consume no pack ledger),
  // não via saldo em dinheiro. Nesse caso o estorno deve devolver
  // 1 crédito do pack, não cents na carteira.
  const { data: packConsume } = await svc
    .from("reseller_pack_ledger")
    .select("id, kind")
    .eq("order_id", sale.id)
    .in("kind", ["consume", "sale_consume"])
    .limit(1)
    .maybeSingle();

  const notesObj = parseNotes(sale.notes);
  const paidWithPackByMetadata = sale_type === "storefront"
    ? sale.delivery_source === "pack"
    : notesObj?.delivery_source === "pack";

  const { data: packRefundExisting } = await svc
    .from("reseller_pack_ledger")
    .select("id")
    .eq("order_id", sale.id)
    .eq("kind", "sale_refund")
    .limit(1)
    .maybeSingle();

  if ((packConsume || paidWithPackByMetadata) && packRefundExisting) {
    await svc.from(table).update({
      cancellation_status: "balance_refunded",
      balance_refunded_at: new Date().toISOString(),
      status: "reembolsado",
    }).eq("id", sale.id);
    return json({ ok: true, refunded_pack_credits: 0, already_refunded_to_pack: true });
  }

  if ((packConsume || paidWithPackByMetadata) && !packRefundExisting) {
    const descPack = sale_type === "storefront"
      ? `Estorno venda Loja #${sale.short_code ?? sale.id}`
      : `Estorno licença ${sale.license_key ?? sale.id}`;
    const { error: pErr } = await svc.rpc("pack_refund_credit", {
      _reseller_id: reseller.id,
      _order_id: sale.id,
      _description: descPack,
    });
    if (pErr) return json({ error: pErr.message }, 500);

    await svc.from(table).update({
      cancellation_status: "balance_refunded",
      balance_refunded_at: new Date().toISOString(),
      status: "reembolsado",
    }).eq("id", sale.id);
    return json({ ok: true, refunded_pack_credits: 1 });
  }

  if (!amount || amount <= 0) {
    // Mesmo sem valor, fecha o ciclo (nada a creditar).
    await svc.from(table).update({
      cancellation_status: "balance_refunded",
      balance_refunded_at: new Date().toISOString(),
      status: "reembolsado",
    }).eq("id", sale.id);
    return json({ ok: true, refunded_cents: 0, note: "no_amount_to_refund" });
  }

  const kind = sale_type === "storefront" ? "order_refund" : "license_purchase_refund";
  const desc = sale_type === "storefront"
    ? `Estorno venda Loja #${sale.short_code ?? sale.id}`
    : `Estorno licença ${sale.license_key ?? sale.id}`;

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
    status: "reembolsado",
  }).eq("id", sale.id);

  return json({ ok: true, refunded_cents: amount });
});