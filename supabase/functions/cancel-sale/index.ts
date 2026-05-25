// Cancela uma venda pós-pagamento.
// Etapas:
//   1) Revoga a chave da licença (obrigatório).
//   2) Se refund_method='auto' e a venda é da Loja Pública, faz cash-out PIX via MisticPay
//      do revendedor para a chave PIX do cliente. Se 'manual', só marca como reembolsado.
// Não credita o saldo do revendedor aqui — isso é feito separadamente em refund-sale-balance.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MISTIC_BASE = "https://api.misticpay.com/api";
const DEFAULT_PROVIDER_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SaleType = "storefront" | "manual";
type RefundMethod = "auto" | "manual";

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
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;

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
      message: "Vendas manuais/API só aceitam reembolso manual.",
    }, 400);
  }
  if (refund_method === "auto" && (!pix_key || !pix_key_type)) {
    return json({ error: "missing_pix_key" }, 400);
  }

  const { data: isManager } = await svc.rpc("has_role", { _user_id: userId, _role: "gerente" });

  // 0) Carrega a venda e valida que pertence ao revendedor logado ou ao gerente
  const { data: reseller } = await svc.from("resellers")
    .select("id, is_active").eq("user_id", userId).maybeSingle();
  if (!isManager && (!reseller || !reseller.is_active)) return json({ error: "reseller_inactive" }, 403);

  const table = sale_type === "storefront" ? "storefront_orders" : "orders";
  let saleQuery = svc
    .from(table)
    .select("*")
    .eq("id", sale_id);
  if (!isManager) saleQuery = saleQuery.eq("reseller_id", reseller.id);
  const { data: sale, error: sErr } = await saleQuery.maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  if (!sale) return json({ error: "sale_not_found" }, 404);

  if (sale.is_legacy) {
    return json({ error: "legacy_sale", message: "Venda legado não pode ser cancelada." }, 409);
  }

  // Storefront precisa estar pago/concluído; orders aceitam status concluído também
  const okStatus = sale_type === "storefront"
    ? ["paid", "completed"].includes(sale.status)
    : ["completed", "paid"].includes(sale.status);
  if (!okStatus) {
    return json({
      error: "invalid_status",
      message: `Venda em status '${sale.status}' não pode ser cancelada por aqui.`,
    }, 409);
  }
  if (["balance_refunded", "client_refunded", "key_revoked", "pending"].includes(sale.cancellation_status)) {
    // já em fluxo de cancelamento
    return json({
      error: "already_in_cancellation",
      cancellation_status: sale.cancellation_status,
    }, 409);
  }

  const license_key: string | null = sale.license_key ?? null;

  // Marca como cancelamento iniciado
  await svc.from(table).update({
    cancellation_status: "pending",
    cancelled_at: new Date().toISOString(),
    cancelled_by: userId,
  }).eq("id", sale.id);

  // 1) REVOGAÇÃO DA CHAVE — pré-requisito absoluto.
  if (license_key) {
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_PROVIDER_BASE;
    if (!provKey) {
      await svc.from(table).update({
        cancellation_status: "failed",
        key_revoke_error: "Provedor não configurado",
      }).eq("id", sale.id);
      return json({ error: "provider_not_configured" }, 502);
    }

    let provStatus = 0;
    let provData: any = null;
    try {
      const r = await fetch(`${base}/revoke-license`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ license_key }),
      });
      provStatus = r.status;
      const txt = await r.text();
      try { provData = JSON.parse(txt); } catch { provData = { raw: txt }; }
    } catch (e) {
      provData = { error: e instanceof Error ? e.message : "network" };
    }

    // 404/410 do provedor: chave já não existe lá — consideramos revogada.
    const alreadyGone = provStatus === 404 || provStatus === 410;
    if (!(provStatus >= 200 && provStatus < 300) && !alreadyGone) {
      const msg = (provData?.error ?? `Provedor retornou ${provStatus}`).toString().slice(0, 500);
      await svc.from(table).update({
        cancellation_status: "failed",
        key_revoke_error: msg,
      }).eq("id", sale.id);

      // Alerta gerente via Telegram
      try {
        await svc.rpc("telegram_enqueue", {
          _text: `⚠️ <b>Falha ao revogar chave em cancelamento</b>\nVenda: <code>${sale.short_code ?? sale.id}</code>\nChave: <code>${license_key}</code>\nErro: ${msg}`,
        });
      } catch (_) { /* noop */ }

      return json({
        error: "revoke_failed",
        message: "Não foi possível revogar a chave. O cancelamento foi pausado e o gerente foi avisado.",
        provider_status: provStatus,
        provider_response: provData,
      }, 502);
    }
  }

  // Revogação OK
  await svc.from(table).update({
    cancellation_status: "key_revoked",
    key_revoked_at: new Date().toISOString(),
  }).eq("id", sale.id);

  // 2) REEMBOLSO AO CLIENTE
  if (refund_method === "manual") {
    await svc.from(table).update({
      cancellation_status: "client_refunded",
      client_refund_method: "manual",
      client_refunded_at: new Date().toISOString(),
      client_refund_pix_key: null,
      error_message: notes ?? sale.error_message,
    }).eq("id", sale.id);
    await notifyCancelled(svc, { sale, sale_type, method: "manual", actorId: userId, isManager: !!isManager, notes });
    return json({ ok: true, step: "client_refunded", method: "manual" });
  }

  // Auto via MisticPay (apenas storefront)
  const refundResellerId = sale.reseller_id ?? reseller?.id;
  if (!refundResellerId) {
    return json({ error: "missing_reseller_id" }, 400);
  }
  const { data: integ } = await svc
    .from("reseller_integrations")
    .select("misticpay_client_id, misticpay_client_secret")
    .eq("reseller_id", refundResellerId)
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
  const payload: Record<string, unknown> = {
    amount,
    pixKey: pix_key,
    pixKeyType: pix_key_type, // 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
    description: `Estorno venda ${sale.short_code ?? sale.id}`,
    transactionId: `refund_${sale.id}`,
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

  await notifyCancelled(svc, { sale, sale_type, method: "auto", actorId: userId, isManager: !!isManager, notes, pix_key });
  return json({ ok: true, step: "client_refunded", method: "auto", provider: d });
});

async function notifyCancelled(
  svc: ReturnType<typeof createClient>,
  opts: {
    sale: any;
    sale_type: SaleType;
    method: RefundMethod;
    actorId: string;
    isManager: boolean;
    notes: string | null;
    pix_key?: string;
  },
) {
  try {
    const { sale, sale_type, method, actorId, isManager, notes, pix_key } = opts;
    const { data: settings } = await svc.from("telegram_settings")
      .select("chat_id").eq("id", 1).maybeSingle();
    if (!settings?.chat_id) return;

    const { data: rsl } = await svc.from("resellers")
      .select("display_name").eq("id", sale.reseller_id).maybeSingle();
    let actorName = "—";
    if (isManager) {
      actorName = "Gerente (Admin)";
    } else {
      const { data: p } = await svc.from("profiles")
        .select("display_name,email").eq("id", actorId).maybeSingle();
      actorName = p?.display_name ?? p?.email ?? "Revendedor";
    }

    const amountBrl = "R$ " + (Number(sale.price_cents ?? 0) / 100)
      .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const orderRef = sale.short_code ?? String(sale.id).slice(0, 8);
    const lines: string[] = [
      "🚫 <b>Venda cancelada</b>",
      `🧾 Pedido: <code>#${orderRef}</code>`,
      `📂 Tipo: ${sale_type === "storefront" ? "Loja Pública" : "Manual/API"}`,
      `👨‍💼 Revendedor: ${rsl?.display_name ?? "—"}`,
      `🧑 Cancelado por: ${actorName}`,
      `💵 Valor: ${amountBrl}`,
    ];
    if (sale.license_key) lines.push(`🔑 Chave: <code>${sale.license_key}</code> (revogada)`);
    lines.push(`↩️ Estorno ao cliente: ${method === "auto" ? "Automático via PIX" : "Manual"}`);
    if (method === "auto" && pix_key) lines.push(`🔁 PIX destino: <code>${pix_key}</code>`);
    if (notes) lines.push(`📝 ${notes}`);

    await svc.rpc("telegram_enqueue", { _text: lines.join("\n") });
  } catch (_) { /* noop */ }
}