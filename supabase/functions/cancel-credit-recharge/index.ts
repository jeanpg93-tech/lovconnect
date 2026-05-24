// Cancela uma recarga de créditos APÓS o pagamento, mas ANTES da entrega começar.
// Regras de janela de cancelamento:
//   - sale_type="manual" (reseller_credit_purchases):
//       * status precisa ser pré-entrega: aguardando/pending/processando
//       * se tem provider_pedido_id e provider_credit_orders existe → status do provedor deve ser
//         "aguardando", etapa_processamento null/≤1, creditos_enviados null/0
//       * se tem manual_recharge_metadata → invite_status deve ser "pending"
//         (uma vez 'sent' ou 'confirmed', o cliente já vinculou o bot → bloqueado)
//   - sale_type="storefront" (storefront_orders product_type='credits'):
//       * status precisa ser "paid" (PIX confirmado mas ainda não entregue)
//       * "completed" → entregue, bloqueado
//
// NÃO revoga chave (não existe). Apenas reembolsa o cliente (auto MisticPay para storefront ou manual).
// O crédito de volta no saldo do revendedor é feito em refund-credit-recharge-balance.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MISTIC_BASE = "https://api.misticpay.com/api";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SaleType = "storefront" | "manual";
type RefundMethod = "auto" | "manual";

const PRE_DELIVERY_MANUAL_STATUSES = ["aguardando", "pending", "processando"];
const PRE_DELIVERY_PROVIDER_STATUSES = ["aguardando", "pending", "pendente"];

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
  const sale_type = String(body.sale_type ?? "") as SaleType;
  const sale_id = typeof body.sale_id === "string" ? body.sale_id : "";
  const refund_method = String(body.refund_method ?? "manual") as RefundMethod;
  const pix_key = typeof body.pix_key === "string" ? body.pix_key.trim() : "";
  const pix_key_type = typeof body.pix_key_type === "string" ? body.pix_key_type.trim() : "";

  if (sale_type !== "storefront" && sale_type !== "manual") {
    return json({ error: "invalid_sale_type" }, 400);
  }
  if (!sale_id) return json({ error: "missing_sale_id" }, 400);
  if (refund_method !== "auto" && refund_method !== "manual") {
    return json({ error: "invalid_refund_method" }, 400);
  }
  if (sale_type === "manual" && refund_method === "auto") {
    return json({
      error: "auto_not_supported_for_manual",
      message: "Recargas manuais/API só aceitam reembolso manual.",
    }, 400);
  }
  if (refund_method === "auto" && (!pix_key || !pix_key_type)) {
    return json({ error: "missing_pix_key" }, 400);
  }

  const { data: reseller } = await svc.from("resellers")
    .select("id, is_active").eq("user_id", userId).maybeSingle();
  if (!reseller || !reseller.is_active) return json({ error: "reseller_inactive" }, 403);

  const table = sale_type === "storefront" ? "storefront_orders" : "reseller_credit_purchases";
  const { data: sale, error: sErr } = await svc
    .from(table)
    .select("*")
    .eq("id", sale_id)
    .eq("reseller_id", reseller.id)
    .maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  if (!sale) return json({ error: "sale_not_found" }, 404);

  // Garante que é recarga de crédito (storefront pode ter outros product_types)
  if (sale_type === "storefront" && sale.product_type !== "credits") {
    return json({ error: "not_a_credit_recharge" }, 400);
  }

  if (["balance_refunded", "client_refunded", "pending"].includes(sale.cancellation_status)) {
    return json({
      error: "already_in_cancellation",
      cancellation_status: sale.cancellation_status,
    }, 409);
  }

  // ============= VALIDAÇÃO DA JANELA DE CANCELAMENTO =============
  if (sale_type === "storefront") {
    if (sale.status !== "paid") {
      return json({
        error: "cannot_cancel",
        reason: "delivery_window_closed",
        message: sale.status === "completed"
          ? "Recarga já entregue — não é mais possível cancelar."
          : `Recarga em status '${sale.status}' não pode ser cancelada por aqui.`,
      }, 409);
    }
  } else {
    // manual / API
    if (!PRE_DELIVERY_MANUAL_STATUSES.includes(String(sale.status))) {
      return json({
        error: "cannot_cancel",
        reason: "delivery_window_closed",
        message: `Recarga já iniciada (status '${sale.status}') — não é mais possível cancelar.`,
      }, 409);
    }
    const providerPedidoId: string | null = sale.provider_pedido_id ?? null;
    if (providerPedidoId) {
      // (a) provedor automático
      const { data: prov } = await svc
        .from("provider_credit_orders")
        .select("status, etapa_processamento, creditos_enviados")
        .eq("pedido_id", providerPedidoId)
        .maybeSingle();
      if (prov) {
        const provStatus = String(prov.status ?? "").toLowerCase().trim();
        const etapa = Number(prov.etapa_processamento ?? 0);
        const enviados = Number(prov.creditos_enviados ?? 0);
        const started = !PRE_DELIVERY_PROVIDER_STATUSES.includes(provStatus)
          || etapa > 1
          || enviados > 0;
        if (started) {
          return json({
            error: "cannot_cancel",
            reason: "delivery_started",
            message: "Recarga já iniciada no provedor — não é mais possível cancelar.",
            provider_status: provStatus,
            etapa_processamento: etapa,
            creditos_enviados: enviados,
          }, 409);
        }
      }
      // (b) manual (revendedor entrega) — bot vinculado ao workspace?
      const { data: meta } = await svc
        .from("manual_recharge_metadata")
        .select("invite_status")
        .eq("provider_pedido_id", providerPedidoId)
        .maybeSingle();
      if (meta && meta.invite_status && meta.invite_status !== "pending") {
        return json({
          error: "cannot_cancel",
          reason: "invite_already_linked",
          message: "Cliente já vinculou o bot ao workspace — não é mais possível cancelar.",
          invite_status: meta.invite_status,
        }, 409);
      }
    }
  }

  // Marca início do cancelamento (guarda contra race: só se ainda 'none')
  const { data: lockRow, error: lockErr } = await svc.from(table).update({
    cancellation_status: "pending",
    cancelled_at: new Date().toISOString(),
    cancelled_by: userId,
  }).eq("id", sale.id).eq("cancellation_status", "none").select("id").maybeSingle();
  if (lockErr || !lockRow) {
    return json({
      error: "race_condition",
      message: "Esta recarga já entrou em outro fluxo de cancelamento — recarregue a página.",
    }, 409);
  }

  // ============= REEMBOLSO AO CLIENTE =============
  if (refund_method === "manual") {
    await svc.from(table).update({
      cancellation_status: "client_refunded",
      client_refund_method: "manual",
      client_refunded_at: new Date().toISOString(),
      client_refund_pix_key: null,
    }).eq("id", sale.id);
    return json({ ok: true, step: "client_refunded", method: "manual" });
  }

  // Auto via MisticPay — apenas storefront
  const { data: integ } = await svc
    .from("reseller_integrations")
    .select("misticpay_client_id, misticpay_client_secret")
    .eq("reseller_id", reseller.id)
    .maybeSingle();
  const ci = integ?.misticpay_client_id?.trim();
  const cs = integ?.misticpay_client_secret?.trim();
  if (!ci || !cs) {
    await svc.from(table).update({
      client_refund_error: "MisticPay do revendedor não configurado",
    }).eq("id", sale.id);
    return json({ error: "misticpay_not_configured" }, 400);
  }

  const amount = Number(sale.price_cents) / 100;
  const refLabel = sale_type === "storefront" ? (sale.short_code ?? sale.id) : sale.id;
  const payload: Record<string, unknown> = {
    amount,
    pixKey: pix_key,
    pixKeyType: pix_key_type,
    description: `Estorno recarga ${refLabel}`,
    transactionId: `refund_credit_${sale.id}`,
  };

  let wStatus = 0;
  let wData: any = null;
  try {
    const r = await fetch(`${MISTIC_BASE}/transactions/withdraw`, {
      method: "POST",
      headers: { ci, cs, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    wStatus = r.status;
    const txt = await r.text();
    try { wData = JSON.parse(txt); } catch { wData = { raw: txt }; }
  } catch (e) {
    wData = { error: e instanceof Error ? e.message : "network" };
  }

  if (!(wStatus >= 200 && wStatus < 300)) {
    const errMsg = (wData?.message ?? wData?.error ?? `MisticPay retornou ${wStatus}`).toString().slice(0, 500);
    await svc.from(table).update({
      client_refund_error: errMsg,
    }).eq("id", sale.id);
    return json({
      error: "misticpay_withdraw_failed",
      message: errMsg,
      provider_status: wStatus,
      provider_response: wData,
    }, 502);
  }

  const d = wData?.data ?? wData ?? {};
  await svc.from(table).update({
    cancellation_status: "client_refunded",
    client_refund_method: "auto",
    client_refunded_at: new Date().toISOString(),
    client_refund_pix_key: pix_key,
    client_refund_endtoend_id: String(d.endToEndId ?? d.transactionId ?? "") || null,
    client_refund_error: null,
  }).eq("id", sale.id);

  return json({ ok: true, step: "client_refunded", method: "auto", provider: d });
});