import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { computeDiscount } from "../_shared/promotion.ts";

const DEFAULT_PROVIDER_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MISTIC_BASE = "https://api.misticpay.com/api";
// Conta de testes — Jean Gomes (jeanpg.93). Apenas para essa conta a libera o
// bypass da verificação MisticPay quando o painel envia o cabeçalho secreto.
const TEST_RESELLER_ID = "68fddcfb-5e1f-492c-be75-9a8a3d2a63fa";
// MétodoFlow tem teto de 60 dias no provedor — bloqueia 90d/365d como defesa adicional.
const FLOW_DISALLOWED_TYPES = new Set(["90d", "365d"]);

// Taxa padrão por transação (fallback quando o webhook não envia `fee`).
// Na prática a MisticPay envia o campo `fee` em reais (ex.: 0.50 ou 0.55) e
// esse valor real é o que registramos como despesa.
const MISTICPAY_FEE_CENTS = 50;

/**
 * Registra automaticamente a taxa MisticPay como despesa no Financeiro do gerente,
 * usando o VALOR REAL da taxa enviado no payload do webhook (`payload.fee`, em reais).
 * Se `feeCents` não vier informado, cai no padrão de R$ 0,50. Idempotente por `tx_id`.
 */
async function recordMisticPayFee(
  admin: any,
  txId: string,
  originKind: string,
  originId: string | null,
  originLabel: string,
  entryDate?: string | null,
  feeCents?: number | null,
) {
  try {
    if (!txId) return;
    const amount_cents = Number.isFinite(feeCents as number) && (feeCents as number) > 0
      ? Math.round(feeCents as number)
      : MISTICPAY_FEE_CENTS;
    const feeBRL = (amount_cents / 100).toFixed(2).replace(".", ",");
    const dateIso = entryDate ?? new Date().toISOString();
    const entry_date = dateIso.slice(0, 10);
    // Idempotência: já existe lançamento automático para esse tx_id?
    const { data: existing } = await admin
      .from("manual_financial_entries")
      .select("id")
      .eq("reference_kind", "misticpay_fee")
      .contains("reference_meta", { tx_id: txId })
      .limit(1);
    if (existing && existing.length > 0) return;
    await admin.from("manual_financial_entries").insert({
      entry_type: "expense",
      category: "gateway_fee",
      description: `Taxa MisticPay (R$ ${feeBRL}) — ${originLabel}`,
      amount_cents,
      entry_date,
      reference_kind: "misticpay_fee",
      reference_meta: { tx_id: txId, origin: originKind, origin_id: originId, fee_cents: amount_cents },
    });
  } catch (e) {
    console.error("recordMisticPayFee failed", e);
  }
}

/**
 * Lança automaticamente a RECEITA de uma venda feita na "Loja do Gerente" (LovaStore).
 * A conta considerada como loja própria fica em app_settings.manager_reseller_id.
 * Idempotente pelo id do storefront_order.
 *
 * amount_cents  = preço pago pelo cliente (price_cents da venda)
 * cost_cents    = custo do dono (ex: custo do fornecedor); usa storeOrder.cost_cents
 *                 quando disponível — pode ser 0 para chaves de extensão.
 */
async function recordLovaStoreRevenue(admin: any, storeOrder: any, paidAt?: string | null) {
  try {
    if (!storeOrder?.id || !storeOrder?.reseller_id) return;
    const { data: setting } = await admin
      .from("app_settings").select("value").eq("key", "manager_reseller_id").maybeSingle();
    const managerId = typeof setting?.value === "string" ? setting.value : (setting?.value ?? null);
    if (!managerId || managerId !== storeOrder.reseller_id) return;

    // idempotência: já existe lançamento automático para essa venda?
    const { data: existing } = await admin
      .from("manual_financial_entries")
      .select("id")
      .eq("reference_kind", "lovastore")
      .contains("reference_meta", { storefront_order_id: storeOrder.id })
      .limit(1);
    if (existing && existing.length > 0) return;

    const dateIso = paidAt ?? new Date().toISOString();
    const entry_date = dateIso.slice(0, 10);
    const amount_cents = Number(storeOrder.price_cents || 0);
    const cost_cents = Number(storeOrder.cost_cents || 0);
    const label =
      storeOrder.product_type === "credits"
        ? `${storeOrder.credit_amount ?? 0} créditos`
        : storeOrder.product_type === "recharge_plan"
          ? `Plano de recarga`
          : storeOrder.product_type === "extension" || storeOrder.license_type
            ? `Licença ${storeOrder.license_type ?? ""}`.trim()
            : "venda";
    await admin.from("manual_financial_entries").insert({
      entry_type: "revenue",
      category: "LovaStore",
      description: `LovaStore — ${label}${storeOrder.buyer_name ? ` · ${storeOrder.buyer_name}` : ""}`,
      amount_cents,
      cost_cents,
      entry_date,
      reference_kind: "lovastore",
      reference_meta: {
        storefront_order_id: storeOrder.id,
        short_code: storeOrder.short_code ?? null,
        product_type: storeOrder.product_type ?? null,
        auto: true,
      },
    });
  } catch (e) {
    console.error("recordLovaStoreRevenue failed", e);
  }
}

/**
 * Confirma com a API da MisticPay que a transação realmente está paga (status COMPLETO).
 * Protege o webhook contra POSTs forjados que tentam creditar saldo sem pagamento real.
 * Procura o txId nas primeiras 3 páginas de transações COMPLETO da conta dona das credenciais.
 */
async function verifyMisticTxPaid(
  ci: string | undefined | null,
  cs: string | undefined | null,
  txId: string,
): Promise<boolean> {
  if (!ci || !cs || !txId) return false;
  try {
    for (let page = 1; page <= 3; page++) {
      const r = await fetch(`${MISTIC_BASE}/users/transactions/list/${page}?status=COMPLETO`, {
        method: "GET",
        headers: { ci, cs, "Content-Type": "application/json" },
      });
      if (!r.ok) {
        console.error(`[verifyMistic] page ${page} returned ${r.status}`);
        continue;
      }
      const txt = await r.text();
      if (txt.includes(txId)) return true;
      if (txt.length < 200) return false; // resposta vazia / sem mais páginas
    }
  } catch (e) {
    console.error("verifyMisticTxPaid error", e);
  }
  return false;
}

/** Recupera as credenciais MisticPay do gerente (env primeiro, depois app_settings). */
async function getManagerMisticCreds(admin: any): Promise<{ ci: string | null; cs: string | null }> {
  let ci = Deno.env.get("MISTICPAY_CLIENT_ID") ?? null;
  let cs = Deno.env.get("MISTICPAY_CLIENT_SECRET") ?? null;
  if (ci && cs) return { ci, cs };
  try {
    const { data } = await admin.from("app_settings")
      .select("key, value")
      .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
    for (const row of (data ?? []) as any[]) {
      const v = typeof row.value === "string" ? row.value : (row.value?.value ?? row.value);
      if (row.key === "misticpay_client_id" && !ci) ci = v ?? null;
      if (row.key === "misticpay_client_secret" && !cs) cs = v ?? null;
    }
  } catch (e) {
    console.warn("getManagerMisticCreds app_settings failed", e);
  }
  return { ci, cs };
}

function mapTypeToProviderBody(type: string): Record<string, unknown> {
  switch (type) {
    case "1d": return { days: 1 };
    case "7d": return { days: 7 };
    case "30d": return { days: 30 };
    case "90d": return { days: 90 };
    case "365d": return { days: 365 };
    case "pro_1d": return { days: 1 };
    case "pro_7d": return { days: 7 };
    case "pro_15d": return { days: 15 };
    case "pro_30d": return { days: 30 };
    // Vitalício no Lovax = 36500 dias (~100 anos). O Lovax não entende `lifetime: true`,
    // só aceita `days`. Sem isso, o fallback abaixo entregaria 30 dias para vitalício.
    case "lifetime": return { days: 36500, lifetime: true };
    default: return { days: 30 };
  }
}

function mapLicenseTypeToDuration(type: string): string {
  // Normaliza variantes vindas da loja: "1d", "pro_1d", "flow_pro_1d", etc.
  const t = String(type ?? "").toLowerCase().trim();
  if (t === "lifetime" || t.endsWith("_lifetime")) return "Vitalício";
  if (t === "trial" || t.endsWith("_trial")) return "Teste (15 min)";
  if (t === "credits") return "Créditos";
  const m = t.match(/(\d+)\s*d$/);
  if (m) {
    const n = Number(m[1]);
    return `${n} ${n === 1 ? "Dia" : "Dias"}`;
  }
  return t || "—";
}

function providerEmailAlreadyExists(resp: any): boolean {
  const msg = String(
    resp?.error ??
    resp?.message ??
    resp?.detail ??
    resp?.raw ??
    resp?.data?.error ??
    resp?.data?.message ??
    "",
  ).toLowerCase();
  return (
    msg.includes("e-mail já cadastrado") ||
    msg.includes("email já cadastrado") ||
    msg.includes("e-mail ja cadastrado") ||
    msg.includes("email ja cadastrado") ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("already has")
  );
}

function extractClaudeProviderFields(resp: any) {
  return {
    code: resp?.code ?? resp?.key ?? resp?.data?.code ?? resp?.data?.key,
    providerKeyId: resp?.id ?? resp?.key_id ?? resp?.data?.id,
    providerApiKey: resp?.apiKey ?? resp?.api_key ?? resp?.data?.apiKey ?? resp?.data?.api_key,
    providerUserId: resp?.userId ?? resp?.user_id ?? resp?.data?.userId ?? resp?.data?.user_id,
  };
}

async function triggerReleasePending(orderIds: string[]) {
  for (const id of orderIds) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/release-pending-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ order_id: id }),
      });
    } catch (e) {
      console.warn("release-pending-order invoke failed", id, e);
    }
  }
}

async function triggerWhatsAppNotify(payload: any) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/system-whatsapp-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ mode: "auto", ...payload }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) console.warn("system-whatsapp-notify failed", res.status, data);
  } catch (e) {
    console.warn("system-whatsapp-notify invoke failed", e);
  }
}

async function notifyTelegramStorefrontLicenseSale(admin: any, storeOrder: any, licenseKey: string | null, costCents: number) {
  try {
    const { data: settings } = await admin
      .from("telegram_settings")
      .select("chat_id, notify_sales")
      .eq("id", 1)
      .maybeSingle();
    if (!settings?.chat_id || settings.notify_sales === false) return;

    const { data: existing } = await admin
      .from("telegram_outbox")
      .select("id")
      .eq("reference_kind", "storefront_license_sale")
      .eq("reference_id", storeOrder.id)
      .limit(1);
    if (existing && existing.length > 0) return;

    const { data: reseller } = await admin
      .from("resellers")
      .select("display_name")
      .eq("id", storeOrder.reseller_id)
      .maybeSingle();

    const { data: bal } = await admin
      .from("reseller_balances")
      .select("balance_cents")
      .eq("reseller_id", storeOrder.reseller_id)
      .maybeSingle();

    const amountBRL = "R$ " + (Number(costCents || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const balanceBRL = "R$ " + (Number(bal?.balance_cents ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const text =
      "🛒 <b>Venda na Loja Pública</b>\n" +
      "👨‍💼 Revendedor: " + (reseller?.display_name ?? "—") + "\n" +
      "💵 Valor: " + amountBRL + "\n" +
      "💰 Saldo atual: " + balanceBRL + "\n" +
      "🧾 Pedido (loja): <code>#" + (storeOrder.short_code ?? storeOrder.id.slice(0, 8)) + "</code>\n" +
      "🆔 ID completo: <code>" + storeOrder.id + "</code>\n" +
      "📦 Produto: Licença " + (storeOrder.license_type ?? "—") + "\n" +
      "🔑 Chave: <code>" + (licenseKey ?? "—") + "</code>\n" +
      "👤 Cliente: " + (storeOrder.buyer_name ?? "—") + " (" + (storeOrder.buyer_whatsapp ?? "—") + ")\n" +
      "🏷 Canal: Loja Pública\n" +
      "💳 Pagamento: Saldo da carteira (PIX " + (storeOrder.provider ?? "misticpay") + ")";

    await admin.from("telegram_outbox").insert({
      text,
      reference_kind: "storefront_license_sale",
      reference_id: storeOrder.id,
    });
  } catch (e) {
    console.warn("telegram storefront license notify failed", e);
  }
}

/**
 * Cria o pedido de recargas no provedor externo (mesma API usada pelo painel manual),
 * registra em reseller_credit_purchases e devolve o provider_pedido_id para o link do cliente.
 */
async function createProviderCreditOrder(admin: any, storeOrder: any, costCents: number) {
  const { data: master } = await admin
    .from("app_settings").select("value").eq("key", "lovable_credits_master").maybeSingle();
  const apiKey = (master?.value?.api_key as string | undefined) ?? null;
  if (!apiKey) {
    return { ok: false as const, error: "Provedor de créditos não configurado" };
  }

  let providerData: any = null;
  try {
    const r = await fetch("https://lojinhalovable.com/api/v1/revenda/pedidos", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ creditos: storeOrder.credit_amount, tipo_entrega: "workspace_proprio" }),
    });
    const txt = await r.text();
    try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
    if (!r.ok || providerData?.success === false) {
      return { ok: false as const, error: providerData?.error ?? `Provedor retornou ${r.status}`, providerData };
    }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "erro provedor de créditos" };
  }

  const payload = providerData?.data ?? providerData;
  const providerPedidoId: string | null = payload?.pedidoId ?? payload?.id ?? null;
  if (!providerPedidoId) {
    return { ok: false as const, error: "Provedor não retornou pedidoId", providerData };
  }

  try {
    await admin.from("reseller_credit_purchases").insert({
      reseller_id: storeOrder.reseller_id,
      credits: storeOrder.credit_amount,
      price_cents: costCents,
      cost_cents: costCents || null,
      status: payload?.status ?? "processando",
      tipo_entrega: "workspace_proprio",
      provider_pedido_id: providerPedidoId,
      provider_response: providerData,
      customer_name: storeOrder.buyer_name ?? null,
      customer_whatsapp: storeOrder.buyer_whatsapp ?? null,
    });
  } catch (e) {
    console.warn("reseller_credit_purchases insert failed", e);
  }

  return { ok: true as const, providerPedidoId, providerData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Bypass de teste: somente quando o painel envia o cabeçalho com o service-role
    // key e a transação pertence à conta de testes (Jean Gomes). Isso permite
    // "liberar" um PIX sem o pagamento real para validar o fluxo end-to-end.
    const bypassToken = req.headers.get("x-test-bypass-token") ?? "";
    const __TEST_BYPASS = !!bypassToken && bypassToken === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const payload = await req.json().catch(() => ({}));
    console.log("misticpay-webhook payload", JSON.stringify(payload));

    const txId = String(payload?.transactionId ?? "");
    const status = String(payload?.status ?? "").toUpperCase();
    const type = String(payload?.transactionType ?? "").toUpperCase();
    const paidAt = new Date().toISOString();
    // A MisticPay envia a taxa REAL da transação em reais (ex.: 0.50 ou 0.55).
    // Convertemos para centavos com arredondamento para evitar erros de float.
    const feeRaw = Number(payload?.fee);
    const feeCents = Number.isFinite(feeRaw) && feeRaw > 0
      ? Math.round(feeRaw * 100)
      : null;
    if (!txId) return json({ ok: false, reason: "missing transactionId" }, 200);

    if (type && type !== "DEPOSITO") {
      return json({ ok: true, ignored: "non-deposit" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Wrapper local: só pula a verificação real quando o bypass de teste está
    // ativo. Os call sites continuam idênticos.
    const verifyTx = async (ci: any, cs: any, tx: string, resellerId?: string | null) => {
      if (__TEST_BYPASS && resellerId === TEST_RESELLER_ID) return true;
      return await verifyMisticTxPaid(ci, cs, tx);
    };

    // Activation payment? (R$ 200 ativação do painel)
    {
      const { data: actPay } = await admin
        .from("activation_payments")
        .select("*")
        .eq("provider_transaction_id", txId)
        .maybeSingle();
      if (actPay) {
        if (actPay.status === "approved" || actPay.status === "paid") {
          return json({ ok: true, already: true });
        }
        if (status === "COMPLETO") {
          // Verifica diretamente com a MisticPay antes de ativar o painel
          const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
          const ok = await verifyTx(mci, mcs, txId, actPay.reseller_id);
          if (!ok) {
            console.warn("[webhook] activation tx not confirmed by MisticPay", txId);
            return json({ ok: false, reason: "unverified_transaction" }, 403);
          }

          // Notifica o revendedor sobre a ativação do painel via WhatsApp
          await triggerWhatsAppNotify({
            event_key: "panel_unlocked",
            reseller_id: actPay.reseller_id,
            vars: {
              link: "https://lovconnect.store/painel",
            },
          });


          await admin.from("activation_payments").update({
            status: "paid",
            paid_at: paidAt,
            raw_response: payload,
          }).eq("id", actPay.id);

          await recordMisticPayFee(admin, txId, "activation_payment", actPay.id, `Ativação de painel #${String(actPay.id).slice(0,8)}`, paidAt, feeCents);

          const { error: actErr } = await admin.rpc("activate_reseller", {
            _reseller_id: actPay.reseller_id,
            _payment_id: actPay.id,
            _actor_id: null,
          });
          if (actErr) console.error("activate_reseller error", actErr);

          await admin.from("activation_logs").insert({
            reseller_id: actPay.reseller_id,
            event: "payment_confirmed",
            metadata: { payment_id: actPay.id, source: "webhook" },
          });

          const rUid = (await admin.from("resellers").select("user_id").eq("id", actPay.reseller_id).maybeSingle()).data?.user_id;
          if (rUid) {
            await admin.from("notifications").insert({
              user_id: rUid,
              title: "Painel ativado! 🎉",
              body: "Pagamento confirmado. Seu painel de revendedor está totalmente liberado.",
              type: "activation_approved",
            });
          }

          // Notifica o gerente via Telegram sobre nova ativação de painel paga
          try {
            const { data: tg } = await admin
              .from("telegram_settings")
              .select("chat_id, notify_signups")
              .eq("id", 1)
              .maybeSingle();
            if (tg?.chat_id && (tg as any).notify_signups !== false) {
              const { data: r } = await admin
                .from("resellers")
                .select("display_name")
                .eq("id", actPay.reseller_id)
                .maybeSingle();
              const amountBRL = "R$ " +
                (Number(actPay.amount_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const text =
                "🎉 <b>Nova Ativação de Painel</b>\n" +
                "👨‍💼 Revendedor: " + (r?.display_name ?? "—") + "\n" +
                "💵 Valor: " + amountBRL + "\n" +
                "💳 Pagamento: PIX (MisticPay)";
              await admin.from("telegram_outbox").insert({ text });
            }
          } catch (e) {
            console.warn("[webhook] telegram activation notify failed", e);
          }

          return json({ ok: true, kind: "activation" });
        }
        if (status === "FALHA" || status === "CANCELADO") {
          await admin.from("activation_payments").update({
            status: "cancelled",
            raw_response: payload,
          }).eq("id", actPay.id);
          return json({ ok: true, kind: "activation_failed" });
        }
        return json({ ok: true, status });
      }
    }

    // Try recharge intent first
    const { data: intent } = await admin
      .from("recharge_intents")
      .select("*")
      .eq("provider_transaction_id", txId)
      .maybeSingle();

    if (intent) {
      if (intent.status === "paid") return json({ ok: true, already: true });

      if (status === "COMPLETO") {
        // Verifica direto com a MisticPay antes de creditar a recarga
        const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
        const ok = await verifyTx(mci, mcs, txId, intent.reseller_id);
        if (!ok) {
          console.warn("[webhook] recharge tx not confirmed by MisticPay", txId);
          return json({ ok: false, reason: "unverified_transaction" }, 403);
        }
        const total = Number(intent.amount_cents) + Number(intent.bonus_cents ?? 0);
        // Busca o nível atual para descrever explicitamente o bônus aplicado
        let tierLabel = "";
        if (intent.bonus_cents && Number(intent.bonus_cents) > 0) {
          try {
            const { data: rtier } = await admin.rpc("get_reseller_tier", {
              _reseller_id: intent.reseller_id,
            });
            const rtierRow: any = Array.isArray(rtier) ? rtier[0] : rtier;
            const pct = Math.round(
              (Number(intent.bonus_cents) / Number(intent.amount_cents)) * 100,
            );
            const name = rtierRow?.name ? ` ${rtierRow.name}` : "";
            tierLabel = ` — bônus${name} ${pct}% (+R$ ${(Number(intent.bonus_cents) / 100).toFixed(2)})`;
          } catch (_e) {
            tierLabel = ` (+ bônus R$ ${(Number(intent.bonus_cents) / 100).toFixed(2)})`;
          }
        }
        const { error: credErr } = await admin.rpc("credit_reseller_balance", {
          _reseller_id: intent.reseller_id,
          _amount_cents: total,
          _kind: "recharge",
          _description: `Recarga MisticPay${tierLabel}`,
          _reference_id: intent.id,
        });
        if (credErr) {
          console.error("credit error", credErr);
          return json({ ok: false, error: credErr.message }, 500);
        }
        await recordMisticPayFee(admin, txId, "recharge", intent.id, `Recarga R$ ${(Number(intent.amount_cents)/100).toFixed(2)}`, paidAt, feeCents);
        // Se a recarga foi parte de uma promoção ativa, marca a transação com o promotion_id
        if (intent.promotion_id) {
          try {
            await admin
              .from("balance_transactions")
              .update({ promotion_id: intent.promotion_id })
              .eq("reference_id", intent.id)
              .eq("kind", "recharge")
              .is("promotion_id", null);
          } catch (e) {
            console.warn("failed to tag recharge tx with promotion_id", e);
          }
        }
        // Soma o valor da recarga (sem bônus) ao total gasto p/ progresso de nível
        await admin.rpc("add_reseller_spent", {
          _reseller_id: intent.reseller_id,
          _amount_cents: Number(intent.amount_cents),
        });

        // Comissão de indicação (se houver indicador)
        try {
          const { data: ref } = await admin
            .from("reseller_referrals")
            .select("id, referrer_reseller_id")
            .eq("referred_reseller_id", intent.reseller_id)
            .maybeSingle();
          if (ref?.referrer_reseller_id) {
            const { data: tier } = await admin.rpc("get_reseller_tier", {
              _reseller_id: ref.referrer_reseller_id,
            });
            const tierRow: any = Array.isArray(tier) ? tier[0] : tier;
            const pct = Number(tierRow?.referral_commission_percent ?? 0);
            if (pct > 0) {
              const commission = Math.floor((Number(intent.amount_cents) * pct) / 100);
              if (commission > 0) {
                await admin.rpc("credit_reseller_balance", {
                  _reseller_id: ref.referrer_reseller_id,
                  _amount_cents: commission,
                  _kind: "referral_commission",
                  _description: `Comissão de indicação (${pct}% sobre R$ ${(Number(intent.amount_cents) / 100).toFixed(2)})`,
                  _reference_id: intent.id,
                });
                await admin.rpc("add_referral_commission", {
                  _referral_id: ref.id,
                  _amount_cents: commission,
                });
                // Notifica o indicador que ganhou comissão pela recarga do indicado
                try {
                  const [{ data: referrer }, { data: referred }] = await Promise.all([
                    admin.from("resellers").select("user_id").eq("id", ref.referrer_reseller_id).maybeSingle(),
                    admin.from("resellers").select("display_name").eq("id", intent.reseller_id).maybeSingle(),
                  ]);
                  if (referrer?.user_id) {
                    const name = referred?.display_name || "seu indicado";
                    const commissionBRL = (commission / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const rechargeBRL = (Number(intent.amount_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    await admin.from("notifications").insert({
                      user_id: referrer.user_id,
                      title: `Você ganhou R$ ${commissionBRL} de comissão! 💰`,
                      body: `${name} fez uma recarga de R$ ${rechargeBRL} e você recebeu ${pct}% como comissão de indicação. O valor já está no seu saldo.`,
                      type: "referral_commission",
                    });
                  }
                } catch (notifyErr) {
                  console.warn("referral commission notification failed", notifyErr);
                }
              }
            }
          }
        } catch (e) {
          console.warn("referral commission failed", e);
        }

        await admin.from("recharge_intents").update({
          status: "paid",
          paid_at: paidAt,
          raw_response: payload,
        }).eq("id", intent.id);

        // Notifica o revendedor sobre a recarga confirmada via WhatsApp
        await triggerWhatsAppNotify({
          event_key: "recharge_confirmed",
          reseller_id: intent.reseller_id,
          vars: {
            valor: (Number(intent.amount_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          },
        });

        // Após creditar saldo, tenta liberar vendas em espera
        try {
          const { data: released } = await admin.rpc("try_release_pending_orders", {
            _reseller_id: intent.reseller_id,
          });
          const ids = Array.isArray(released) ? released.filter(Boolean) : [];
          if (ids.length > 0) {
            // Não await para não travar webhook
            triggerReleasePending(ids as string[]);
          }
        } catch (e) {
          console.warn("try_release_pending_orders failed", e);
        }

        // Também tenta liberar pedidos Claude que ficaram "awaiting_balance"
        try {
          const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/claude-release-awaiting`;
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ reseller_id: intent.reseller_id }),
          }).catch(() => {});
        } catch (e) {
          console.warn("claude-release-awaiting trigger failed", e);
        }

        return json({ ok: true, kind: "recharge" });
      }

      if (status === "FALHA" || status === "CANCELADO") {
        await admin.from("recharge_intents").update({
          status: "failed",
          raw_response: payload,
        }).eq("id", intent.id);
        return json({ ok: true });
      }
      return json({ ok: true, status });
    }

    // Otherwise try storefront order
    const { data: storeOrder } = await admin
      .from("storefront_orders")
      .select("*")
      .eq("provider_transaction_id", txId)
      .maybeSingle();

    if (!storeOrder) {
      // Try direct sale (checkout from manager)
      const { data: directSale } = await admin
        .from("direct_sales")
        .select("*")
        .eq("provider_transaction_id", txId)
        .maybeSingle();

      if (directSale) {
        if (directSale.status === "paid") return json({ ok: true, already: true });
        
        // MisticPay status check - common values are "COMPLETO", "PAID", or "SUCCESS"
        const isPaid = status === "COMPLETO" || status === "PAID" || status === "SUCCESS";
        
        if (isPaid) {
          // Confirma com a API da MisticPay
          const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
          const ok = await verifyTx(mci, mcs, txId, null);
          if (!ok) {
            console.warn("[webhook] direct_sale tx not confirmed by MisticPay", txId);
            return json({ ok: false, reason: "unverified_transaction" }, 403);
          }
          await admin.from("direct_sales").update({
            status: "paid",
            updated_at: new Date().toISOString(),
            raw_response: payload
          }).eq("id", directSale.id);

          await recordMisticPayFee(admin, txId, "direct_sale", directSale.id, `Venda direta #${String(directSale.id).slice(0,8)}`, paidAt, feeCents);
          console.log(`[webhook] Venda direta ${directSale.id} marcada como paga`);
          return json({ ok: true, kind: "direct_sale" });
        }

        if (status === "FALHA" || status === "CANCELADO" || status === "FAILED") {
          await admin.from("direct_sales").update({ status: "failed" }).eq("id", directSale.id);
          return json({ ok: true });
        }
        return json({ ok: true, status });
      }

      // Try subscription charge
      const { data: subCharge } = await admin
        .from("reseller_subscription_charges")
        .select("*")
        .eq("provider_charge_id", txId)
        .maybeSingle();

      if (subCharge) {
        if (subCharge.status === "paid") return json({ ok: true, already: true });

        if (status === "COMPLETO" || status === "PAID" || status === "SUCCESS") {
          const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
          const ok = await verifyTx(mci, mcs, txId, subCharge.reseller_id);
          if (!ok) {
            console.warn("[webhook] subscription tx not confirmed by MisticPay", txId);
            return json({ ok: false, reason: "unverified_transaction" }, 403);
          }
          const updates: Record<string, unknown> = {
            status: "paid",
            paid_at: paidAt,
          };
          await admin.from("reseller_subscription_charges").update(updates).eq("id", subCharge.id);

          await recordMisticPayFee(admin, txId, "subscription_charge", subCharge.id, `Mensalidade #${String(subCharge.id).slice(0,8)}`, paidAt, feeCents);

          // If onboarding charge, mark onboarding completed and unblock reseller
          if (subCharge.is_onboarding) {
            await admin.from("resellers").update({
              subscription_onboarding_completed: true,
              subscription_blocked: false,
              subscription_blocked_at: null,
            }).eq("id", subCharge.reseller_id);
          } else {
            // Any paid charge should unblock if blocked
            await admin.from("resellers").update({
              subscription_blocked: false,
              subscription_blocked_at: null,
            }).eq("id", subCharge.reseller_id);
          }

          // Telegram notification for manager (mensalista sale)
          try {
            const { data: tg } = await admin
              .from("telegram_settings")
              .select("chat_id, notify_subscription_sales")
              .eq("id", 1)
              .maybeSingle();
            if (tg?.chat_id && (tg as any).notify_subscription_sales !== false) {
              const { data: r } = await admin
                .from("resellers")
                .select("display_name")
                .eq("id", subCharge.reseller_id)
                .maybeSingle();
              const amountBRL = "R$ " +
                (Number(subCharge.amount_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const kindLabel = subCharge.kind === "monthly"
                ? "Mensalidade"
                : subCharge.kind === "installment" ? "Parcela" : "Cobrança avulsa";
              const text =
                "🟣 <b>Venda Mensalista</b>\n" +
                "👨‍💼 Revendedor: " + (r?.display_name ?? "—") + "\n" +
                "💵 Valor: " + amountBRL + "\n" +
                "📦 Tipo: " + kindLabel +
                (subCharge.is_onboarding ? " (onboarding)" : "") + "\n" +
                (subCharge.description ? "📝 " + subCharge.description + "\n" : "") +
                "💳 Pagamento: PIX (MisticPay)";
              await admin.from("telegram_outbox").insert({ text });
            }
          } catch (e) {
            console.warn("[webhook] telegram subscription notify failed", e);
          }

          return json({ ok: true, kind: "subscription_charge" });
        }

        if (status === "FALHA" || status === "CANCELADO" || status === "FAILED") {
          // Keep charge pending; do not auto-cancel on provider failure
          return json({ ok: true });
        }
        return json({ ok: true, status });
      }

      // Try Claude renewal order (cliente final pagando PIX pra renovar chave)
      const { data: claudeOrder } = await admin
        .from("claude_orders")
        .select("*")
        .eq("provider_transaction_id", txId)
        .maybeSingle();

      if (claudeOrder) {
        if ((claudeOrder as any).status === "issued") return json({ ok: true, already: true });

        if (status === "FALHA" || status === "CANCELADO") {
          await admin.from("claude_orders").update({
            status: "failed",
            error_message: `pix_${status.toLowerCase()}`,
            provider_response: payload,
          }).eq("id", (claudeOrder as any).id);
          return json({ ok: true, kind: "claude_order_failed" });
        }

        if (status !== "COMPLETO" && status !== "PAID" && status !== "SUCCESS") {
          return json({ ok: true, status });
        }

        // Verifica pagamento com as creds MisticPay do PRÓPRIO revendedor
        const { data: integ } = await admin
          .from("reseller_integrations")
          .select("misticpay_client_id, misticpay_client_secret")
          .eq("reseller_id", (claudeOrder as any).reseller_id)
          .maybeSingle();
        const verified = await verifyTx(
          integ?.misticpay_client_id,
          integ?.misticpay_client_secret,
          txId,
          (claudeOrder as any).reseller_id,
        );
        if (!verified) {
          console.warn("[webhook] claude order tx not confirmed by MisticPay", txId);
          return json({ ok: false, reason: "unverified_transaction" }, 403);
        }

        await admin.from("claude_orders").update({
          paid_at: paidAt,
          provider_response: payload,
        }).eq("id", (claudeOrder as any).id);

        await recordMisticPayFee(
          admin,
          txId,
          "claude_renewal",
          (claudeOrder as any).id,
          `Claude: renovação ${(claudeOrder as any).plan_code}`,
          paidAt,
          feeCents,
        );

        // Custo do revendedor (por tier), com fallback ao default
        const planCode = (claudeOrder as any).plan_code as string;
        const resellerId = (claudeOrder as any).reseller_id as string;
        let resellerCostCents = Number((claudeOrder as any).cost_cents ?? 0);
        try {
          const { data: tierCost } = await admin.rpc("get_reseller_claude_cost", {
            _reseller_id: resellerId,
            _plan_code: planCode,
          });
          if (typeof tierCost === "number" && tierCost > 0) resellerCostCents = tierCost;
        } catch (_) { /* fallback */ }

        // Débito atômico do saldo do revendedor
        const { data: debited, error: debitErr } = await admin.rpc("debit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: resellerCostCents,
          _kind: "claude_key_issue",
          _description: `Renovação Claude ${planCode}`,
          _reference_id: (claudeOrder as any).id,
        });
        if (debitErr) {
          console.error("[webhook] claude debit rpc error", debitErr);
          return json({ ok: false, error: "debit_rpc_failed" }, 500);
        }
        if (debited !== true) {
          // Sem saldo — aguarda recarga do revendedor
          await admin.from("claude_orders").update({
            status: "awaiting_balance",
          }).eq("id", (claudeOrder as any).id);
          try {
            const { data: r } = await admin.from("resellers").select("user_id, display_name").eq("id", resellerId).maybeSingle();
            if ((r as any)?.user_id) {
              await admin.from("notifications").insert({
                user_id: (r as any).user_id,
                type: "claude_awaiting_balance",
                title: "Renovação Claude aguardando saldo",
                body: `Cliente pagou renovação (${planCode}) mas seu saldo é insuficiente. Recarregue para emitir a chave.`,
                metadata: { order_id: (claudeOrder as any).id, plan_code: planCode, required_cents: resellerCostCents },
              });
            }
          } catch (_) {}
          return json({ ok: true, kind: "claude_order_awaiting_balance" });
        }
        await admin.rpc("add_reseller_spent", {
          _reseller_id: resellerId,
          _amount_cents: resellerCostCents,
        });

        // Chama o provedor Claude. Renovações usam /renew (não /keys), e uma
        // venda nova com e-mail já existente no provedor cai para /renew para
        // não falhar depois que o PIX já foi confirmado.
        const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY") ?? "";
        const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");
        let providerResp: any = null;
        let providerStatus = 0;
        if (!CLAUDE_BASE_URL || !CLAUDE_API_KEY) {
          providerResp = { error: "provider_not_configured" };
        } else {
          try {
            const customerEmail = String((claudeOrder as any).customer_email ?? "").trim().toLowerCase();
            const callProvider = async (path: string) => {
              const r = await fetch(`${CLAUDE_BASE_URL}${path}`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${CLAUDE_API_KEY}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  kind: planCode,
                  ...(customerEmail ? { email: customerEmail } : {}),
                }),
              });
              const txt = await r.text();
              let body: any = null;
              try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
              return { status: r.status, body };
            };

            const firstPath = (claudeOrder as any).is_renewal ? "/api/rsl/renew" : "/api/rsl/keys";
            let result = await callProvider(firstPath);
            if (firstPath === "/api/rsl/keys" && result.status === 409 && customerEmail && providerEmailAlreadyExists(result.body)) {
              result = await callProvider("/api/rsl/renew");
            }
            providerStatus = result.status;
            providerResp = result.body;
          } catch (e) {
            providerResp = { error: `network_error: ${(e as Error)?.message ?? e}` };
          }
        }

        if (providerStatus < 200 || providerStatus >= 300) {
          // Estorna o débito — não entregamos a chave
          await admin.rpc("credit_reseller_balance", {
            _reseller_id: resellerId,
            _amount_cents: resellerCostCents,
            _kind: "claude_refund",
            _description: `Estorno Claude (falha provedor): ${(claudeOrder as any).id}`,
            _reference_id: (claudeOrder as any).id,
          });
          await admin.from("claude_orders").update({
            status: "failed",
            provider_response: providerResp,
            error_message: `provider_${providerStatus || "error"}`,
          }).eq("id", (claudeOrder as any).id);
          return json({ ok: false, kind: "claude_provider_failed" }, 502);
        }

        let { code, providerKeyId, providerApiKey, providerUserId } = extractClaudeProviderFields(providerResp);
        if ((!code || !providerKeyId || !providerApiKey || !providerUserId) && (claudeOrder as any).customer_email) {
          const { data: prior } = await admin
            .from("claude_orders")
            .select("code, provider_key_id, provider_api_key, provider_user_id")
            .eq("reseller_id", resellerId)
            .ilike("customer_email", String((claudeOrder as any).customer_email).toLowerCase())
            .neq("id", (claudeOrder as any).id)
            .not("code", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          code = code ?? prior?.code;
          providerKeyId = providerKeyId ?? prior?.provider_key_id;
          providerApiKey = providerApiKey ?? prior?.provider_api_key;
          providerUserId = providerUserId ?? prior?.provider_user_id;
        }

        await admin.from("claude_orders").update({
          status: "issued",
          code,
          provider_key_id: providerKeyId,
          provider_api_key: providerApiKey ?? null,
          provider_user_id: providerUserId ?? null,
          provider_response: providerResp,
          code_revealed_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", (claudeOrder as any).id);

        // Notifica revendedor
        try {
          const { data: r } = await admin.from("resellers").select("user_id, display_name").eq("id", resellerId).maybeSingle();
          const isRenewal = !!(claudeOrder as any).is_renewal;
          const title = isRenewal ? "Renovação Claude paga" : "Venda Claude paga";
          const emoji = isRenewal ? "🔄" : "🤖";
          if ((r as any)?.user_id) {
            await admin.from("notifications").insert({
              user_id: (r as any).user_id,
              type: isRenewal ? "claude_renewal_paid" : "claude_sale_paid",
              title,
              body: `Cliente ${((claudeOrder as any).customer_name ?? (claudeOrder as any).customer_email ?? "—")} pagou ${planCode}.`,
              link: "/painel/revendedor/claude",
              metadata: { order_id: (claudeOrder as any).id, plan_code: planCode },
            });
          }
          const amountBRL = "R$ " + (Number((claudeOrder as any).sale_price_cents ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          await admin.from("telegram_outbox").insert({
            text:
              `${emoji} <b>${title}</b>\n` +
              "👨‍💼 Revendedor: " + ((r as any)?.display_name ?? "—") + "\n" +
              "👤 Cliente: " + ((claudeOrder as any).customer_name ?? "—") + "\n" +
              "📦 Plano: " + planCode + "\n" +
              "💵 Valor: " + amountBRL + "\n" +
              "💳 Pagamento: PIX (MisticPay)",
          });
        } catch (_) {}

        return json({ ok: true, kind: "claude_order_issued" });
      }

      // Try pack purchase (revendedor Pack comprando créditos avulsos)
      const { data: packPurchase } = await admin
        .from("reseller_pack_purchases")
        .select("*")
        .eq("provider_tx_id", txId)
        .maybeSingle();

      if (packPurchase) {
        if ((packPurchase as any).status === "paid") return json({ ok: true, already: true });

        if (status === "COMPLETO" || status === "PAID" || status === "SUCCESS") {
          const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
          const ok = await verifyTx(mci, mcs, txId, (packPurchase as any).reseller_id);
          if (!ok) {
            console.warn("[webhook] pack purchase tx not confirmed by MisticPay", txId);
            return json({ ok: false, reason: "unverified_transaction" }, 403);
          }

          await admin.from("reseller_pack_purchases").update({
            status: "paid",
            paid_at: paidAt,
          }).eq("id", (packPurchase as any).id);

          await recordMisticPayFee(admin, txId, "pack_purchase", (packPurchase as any).id, `Pack: ${(packPurchase as any).pack_name ?? "—"}`, paidAt, feeCents);

          const { data: newBal, error: credErr } = await admin.rpc("pack_credit_balance", {
            _reseller_id: (packPurchase as any).reseller_id,
            _credits: (packPurchase as any).credits,
            _kind: "purchase",
            _purchase_id: (packPurchase as any).id,
            _description: `Compra ${(packPurchase as any).pack_name} (${(packPurchase as any).credits} créditos)`,
            _actor_id: null,
          });
          if (credErr) {
            console.error("[webhook] pack_credit_balance failed", credErr);
            return json({ ok: false, error: credErr.message }, 500);
          }

          try {
            const { data: r } = await admin
              .from("resellers").select("display_name, user_id")
              .eq("id", (packPurchase as any).reseller_id).maybeSingle();
            const amountBRL = "R$ " +
              (Number((packPurchase as any).price_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            await admin.from("telegram_outbox").insert({
              text:
                "📦 <b>Compra de Pacote — Revendedor Pack</b>\n" +
                "👨‍💼 Revendedor: " + ((r as any)?.display_name ?? "—") + "\n" +
                "💵 Valor: " + amountBRL + "\n" +
                "🎁 Pacote: " + (packPurchase as any).pack_name + " (" + (packPurchase as any).credits + " licenças)\n" +
                "📊 Licenças restantes: " + (newBal ?? "?"),
            });
            if ((r as any)?.user_id) {
              await admin.from("notifications").insert({
                user_id: (r as any).user_id,
                type: "pack_purchase_paid",
                title: "Pacote confirmado!",
                body: `${(packPurchase as any).credits} licenças liberadas. Restam: ${newBal ?? "?"}.`,
                link: "/painel/revendedor/gerar-chave",
              });

              // Notifica o revendedor sobre o pacote confirmado via WhatsApp
              await triggerWhatsAppNotify({
                event_key: "pack_purchase_confirmed",
                reseller_id: (packPurchase as any).reseller_id,
                vars: {
                  pack_name: (packPurchase as any).pack_name,
                  credits: String((packPurchase as any).credits),
                },
              });
            }
          } catch (e) {
            console.warn("[webhook] pack notify failed", e);
          }

          // Após creditar o pack, tenta liberar vendas em espera (pack ou saldo)
          try {
            const { data: released } = await admin.rpc("try_release_pending_orders", {
              _reseller_id: (packPurchase as any).reseller_id,
            });
            const ids = Array.isArray(released) ? released.filter(Boolean) : [];
            if (ids.length > 0) {
              triggerReleasePending(ids as string[]);
            }
          } catch (e) {
            console.warn("try_release_pending_orders (pack) failed", e);
          }

          return json({ ok: true, kind: "pack_purchase" });
        }

        if (status === "FALHA" || status === "CANCELADO" || status === "FAILED") {
          await admin.from("reseller_pack_purchases").update({ status: "failed" }).eq("id", (packPurchase as any).id);
          return json({ ok: true });
        }
        return json({ ok: true, status });
      }

      console.warn("no intent/order/sale for tx", txId);
      return json({ ok: false, reason: "not found" }, 200);
    }

    if (storeOrder.status === "completed" || storeOrder.status === "paid") {
      return json({ ok: true, already: true });
    }

    if (status === "FALHA" || status === "CANCELADO") {
      await admin.from("storefront_orders").update({
        status: "failed",
        raw_response: payload,
      }).eq("id", storeOrder.id);
      return json({ ok: true });
    }

    if (status !== "COMPLETO") {
      return json({ ok: true, status });
    }

    // Antes de qualquer débito/entrega da venda de loja pública, confirma com a MisticPay
    // usando as credenciais do PRÓPRIO revendedor dono da loja (a venda foi cobrada com elas).
    {
      const { data: integ } = await admin
        .from("reseller_integrations")
        .select("misticpay_client_id, misticpay_client_secret")
        .eq("reseller_id", storeOrder.reseller_id)
        .maybeSingle();
      const ok = await verifyTx(
        integ?.misticpay_client_id,
        integ?.misticpay_client_secret,
        txId,
        storeOrder.reseller_id,
      );
      if (!ok) {
        console.warn("[webhook] storefront tx not confirmed by MisticPay", txId, "reseller", storeOrder.reseller_id);
        return json({ ok: false, reason: "unverified_transaction" }, 403);
      }
    }

    // Se a venda saiu da LOJA PRÓPRIA do gerente (LovaStore), registra automaticamente
    // a receita no Financeiro. Idempotente pelo id do storefront_order.
    await recordLovaStoreRevenue(admin, storeOrder, paidAt);

    // ... existing storefront handling continues below
    {
      const noop = null;
      void noop;
    }

    
    /*
      The block below used to continue here. This comment intentionally keeps
      patch context stable; no runtime behavior change.
    */
    
    if (false) {
      const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${CLAUDE_API_KEY}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                kind: planCode,
                ...((claudeOrder as any).customer_email ? { email: (claudeOrder as any).customer_email } : {}),
              }),
            });
      });
    }

        if (providerStatus < 200 || providerStatus >= 300) {
          // Estorna o débito — não entregamos a chave
          await admin.rpc("credit_reseller_balance", {
            _reseller_id: resellerId,
            _amount_cents: resellerCostCents,
            _kind: "claude_refund",
            _description: `Estorno Claude (falha provedor): ${(claudeOrder as any).id}`,
            _reference_id: (claudeOrder as any).id,
          });
          await admin.from("claude_orders").update({
            status: "failed",
            provider_response: providerResp,
            error_message: `provider_${providerStatus || "error"}`,
          }).eq("id", (claudeOrder as any).id);
          return json({ ok: false, kind: "claude_provider_failed" }, 502);
        }

        const code: string | undefined =
          providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
        const providerKeyId: string | undefined =
          providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
        const providerApiKey: string | undefined =
          providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
        const providerUserId: string | undefined =
          providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

        await admin.from("claude_orders").update({
          status: "issued",
          code,
          provider_key_id: providerKeyId,
          provider_api_key: providerApiKey ?? null,
          provider_user_id: providerUserId ?? null,
          provider_response: providerResp,
          code_revealed_at: new Date().toISOString(),
        }).eq("id", (claudeOrder as any).id);

        // Notifica revendedor
        try {
          const { data: r } = await admin.from("resellers").select("user_id, display_name").eq("id", resellerId).maybeSingle();
          const isRenewal = !!(claudeOrder as any).is_renewal;
          const title = isRenewal ? "Renovação Claude paga" : "Venda Claude paga";
          const emoji = isRenewal ? "🔄" : "🤖";
          if ((r as any)?.user_id) {
            await admin.from("notifications").insert({
              user_id: (r as any).user_id,
              type: isRenewal ? "claude_renewal_paid" : "claude_sale_paid",
              title: `${title}!`,
              body: isRenewal
                ? `Cliente renovou (${planCode}). Chave emitida automaticamente.`
                : `Nova venda de plano ${planCode} paga via PIX. Chave emitida automaticamente.`,
              metadata: { order_id: (claudeOrder as any).id, plan_code: planCode },
            });
          }
          const amountBRL = "R$ " + (Number((claudeOrder as any).sale_price_cents ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          await admin.from("telegram_outbox").insert({
            text:
              `${emoji} <b>${title}</b>\n` +
              "👨‍💼 Revendedor: " + ((r as any)?.display_name ?? "—") + "\n" +
              "👤 Cliente: " + ((claudeOrder as any).customer_name ?? "—") + "\n" +
              "📦 Plano: " + planCode + "\n" +
              "💵 Valor: " + amountBRL + "\n" +
              "💳 Pagamento: PIX (MisticPay)",
          });
        } catch (_) {}

        return json({ ok: true, kind: "claude_order_issued" });
      }

      // Try pack purchase (revendedor Pack comprando créditos avulsos)
      const { data: packPurchase } = await admin
        .from("reseller_pack_purchases")
        .select("*")
        .eq("provider_tx_id", txId)
        .maybeSingle();

      if (packPurchase) {
        if ((packPurchase as any).status === "paid") return json({ ok: true, already: true });

        if (status === "COMPLETO" || status === "PAID" || status === "SUCCESS") {
          const { ci: mci, cs: mcs } = await getManagerMisticCreds(admin);
          const ok = await verifyTx(mci, mcs, txId, (packPurchase as any).reseller_id);
          if (!ok) {
            console.warn("[webhook] pack purchase tx not confirmed by MisticPay", txId);
            return json({ ok: false, reason: "unverified_transaction" }, 403);
          }

          await admin.from("reseller_pack_purchases").update({
            status: "paid",
            paid_at: paidAt,
          }).eq("id", (packPurchase as any).id);

          await recordMisticPayFee(admin, txId, "pack_purchase", (packPurchase as any).id, `Pack: ${(packPurchase as any).pack_name ?? "—"}`, paidAt, feeCents);

          const { data: newBal, error: credErr } = await admin.rpc("pack_credit_balance", {
            _reseller_id: (packPurchase as any).reseller_id,
            _credits: (packPurchase as any).credits,
            _kind: "purchase",
            _purchase_id: (packPurchase as any).id,
            _description: `Compra ${(packPurchase as any).pack_name} (${(packPurchase as any).credits} créditos)`,
            _actor_id: null,
          });
          if (credErr) {
            console.error("[webhook] pack_credit_balance failed", credErr);
            return json({ ok: false, error: credErr.message }, 500);
          }

          try {
            const { data: r } = await admin
              .from("resellers").select("display_name, user_id")
              .eq("id", (packPurchase as any).reseller_id).maybeSingle();
            const amountBRL = "R$ " +
              (Number((packPurchase as any).price_cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            await admin.from("telegram_outbox").insert({
              text:
                "📦 <b>Compra de Pacote — Revendedor Pack</b>\n" +
                "👨‍💼 Revendedor: " + ((r as any)?.display_name ?? "—") + "\n" +
                "💵 Valor: " + amountBRL + "\n" +
                "🎁 Pacote: " + (packPurchase as any).pack_name + " (" + (packPurchase as any).credits + " licenças)\n" +
                "📊 Licenças restantes: " + (newBal ?? "?"),
            });
            if ((r as any)?.user_id) {
              await admin.from("notifications").insert({
                user_id: (r as any).user_id,
                type: "pack_purchase_paid",
                title: "Pacote confirmado!",
                body: `${(packPurchase as any).credits} licenças liberadas. Restam: ${newBal ?? "?"}.`,
                link: "/painel/revendedor/gerar-chave",
              });

              // Notifica o revendedor sobre o pacote confirmado via WhatsApp
              await triggerWhatsAppNotify({
                event_key: "pack_purchase_confirmed",
                reseller_id: (packPurchase as any).reseller_id,
                vars: {
                  pack_name: (packPurchase as any).pack_name,
                  credits: String((packPurchase as any).credits),
                },
              });
            }
          } catch (e) {
            console.warn("[webhook] pack notify failed", e);
          }

          // Após creditar o pack, tenta liberar vendas em espera (pack ou saldo)
          try {
            const { data: released } = await admin.rpc("try_release_pending_orders", {
              _reseller_id: (packPurchase as any).reseller_id,
            });
            const ids = Array.isArray(released) ? released.filter(Boolean) : [];
            if (ids.length > 0) {
              triggerReleasePending(ids as string[]);
            }
          } catch (e) {
            console.warn("try_release_pending_orders (pack) failed", e);
          }

          return json({ ok: true, kind: "pack_purchase" });
        }

        if (status === "FALHA" || status === "CANCELADO" || status === "FAILED") {
          await admin.from("reseller_pack_purchases").update({ status: "failed" }).eq("id", (packPurchase as any).id);
          return json({ ok: true });
        }
        return json({ ok: true, status });
      }

      console.warn("no intent/order/sale for tx", txId);
      return json({ ok: false, reason: "not found" }, 200);
    }

    if (storeOrder.status === "completed" || storeOrder.status === "paid") {
      return json({ ok: true, already: true });
    }

    if (status === "FALHA" || status === "CANCELADO") {
      await admin.from("storefront_orders").update({
        status: "failed",
        raw_response: payload,
      }).eq("id", storeOrder.id);
      return json({ ok: true });
    }

    if (status !== "COMPLETO") {
      return json({ ok: true, status });
    }

    // Antes de qualquer débito/entrega da venda de loja pública, confirma com a MisticPay
    // usando as credenciais do PRÓPRIO revendedor dono da loja (a venda foi cobrada com elas).
    {
      const { data: integ } = await admin
        .from("reseller_integrations")
        .select("misticpay_client_id, misticpay_client_secret")
        .eq("reseller_id", storeOrder.reseller_id)
        .maybeSingle();
      const ok = await verifyTx(
        integ?.misticpay_client_id,
        integ?.misticpay_client_secret,
        txId,
        storeOrder.reseller_id,
      );
      if (!ok) {
        console.warn("[webhook] storefront tx not confirmed by MisticPay", txId, "reseller", storeOrder.reseller_id);
        return json({ ok: false, reason: "unverified_transaction" }, 403);
      }
    }

    // Se a venda saiu da LOJA PRÓPRIA do gerente (LovaStore), registra automaticamente
    // a receita no Financeiro. Idempotente pelo id do storefront_order.
    await recordLovaStoreRevenue(admin, storeOrder, paidAt);

    // ============================================================
    // Venda de Plano de Recarga (3.000 créditos / 30 dias etc) pela loja
    // ============================================================
    if (storeOrder.product_type === "recharge_plan") {
      // marca pedido como pago (já recebemos o PIX do cliente)
      await admin.from("storefront_orders").update({
        status: "paid",
        paid_at: paidAt,
        raw_response: payload,
      }).eq("id", storeOrder.id);

      await recordMisticPayFee(admin, txId, "storefront_recharge_plan", storeOrder.id, `Loja: Plano de Recarga #${storeOrder.short_code ?? String(storeOrder.id).slice(0,8)}`, paidAt, feeCents);

      const planId = storeOrder.recharge_plan_id;
      if (!planId) {
        console.error("[webhook] recharge_plan order without plan_id", storeOrder.id);
        return json({ ok: false, error: "missing_plan_id" }, 500);
      }

      const { data: plan } = await admin
        .from("recharge_plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();
      if (!plan) {
        console.error("[webhook] recharge_plan not found", planId);
        return json({ ok: false, error: "plan_not_found" }, 500);
      }

      const planCost = Number(storeOrder.cost_cents ?? 0);

      // Debita do saldo do revendedor o custo do plano
      if (planCost > 0) {
        const { data: debitOk, error: debitErr } = await admin.rpc("debit_reseller_balance", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: planCost,
          _kind: "recharge_plan_storefront",
          _description: `Venda Loja: Plano ${plan.name}`,
          _reference_id: storeOrder.id,
        });
        if (debitErr) {
          console.error("[webhook] debit_reseller_balance error (recharge_plan)", debitErr);
          return json({ ok: false, error: "debit_rpc_failed", detail: debitErr.message }, 500);
        }
        if (debitOk === false) {
          // Sem saldo — marca como aguardando e registra para liberação posterior
          await admin.from("storefront_orders").update({
            status: "awaiting_balance",
          }).eq("id", storeOrder.id);
          await admin.from("pending_storefront_charges").insert({
            order_id: storeOrder.id,
            reseller_id: storeOrder.reseller_id,
            cost_cents: planCost,
            product_type: "recharge_plan",
          }).select().maybeSingle();
          return json({ ok: true, kind: "storefront_recharge_plan_awaiting_balance" });
        }
        await admin.rpc("add_reseller_spent", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: planCost,
        });
      }

      // Cria a assinatura — status default 'awaiting_owner', cliente segue para /plano/:token
      const { data: sub, error: subErr } = await admin
        .from("reseller_recharge_plan_subscriptions")
        .insert({
          reseller_id: storeOrder.reseller_id,
          plan_id: plan.id,
          customer_name: storeOrder.buyer_name,
          customer_whatsapp: storeOrder.buyer_whatsapp,
          owner_email_required: plan.bot_owner_email,
          source: "storefront",
          source_reference_id: storeOrder.id,
          cost_cents: planCost,
          sale_price_cents: Number(storeOrder.price_cents),
          duration_days: plan.duration_days,
          credits_per_day: plan.credits_per_day,
          total_credits_cap: plan.total_credits_cap,
          delivery_hour: plan.delivery_hour,
        })
        .select("id, order_token")
        .single();

      if (subErr || !sub) {
        // estorna o débito — não conseguimos criar a assinatura
        if (planCost > 0) {
          await admin.rpc("credit_reseller_balance", {
            _reseller_id: storeOrder.reseller_id,
            _amount_cents: planCost,
            _kind: "recharge_plan_refund",
            _description: `Estorno (falha ao criar assinatura): ${storeOrder.id}`,
            _reference_id: storeOrder.id,
          });
        }
        console.error("[webhook] failed to create plan subscription", subErr);
        return json({ ok: false, error: "subscription_create_failed", detail: subErr?.message }, 500);
      }

      // Liga assinatura ao pedido + grava o invite_link com a página /plano/:token
      // Caminho relativo: o frontend (PublicStorefront) usa <a href> e o link funciona
      // na mesma origem da loja pública.
      const link = `/plano/${sub.order_token}`;
      await admin.from("storefront_orders").update({
        status: "completed",
        recharge_plan_subscription_id: sub.id,
        invite_link: link,
      }).eq("id", storeOrder.id);

      return json({ ok: true, kind: "storefront_recharge_plan", order_token: sub.order_token });
    }

    if (storeOrder.product_type === "credits" || storeOrder.product_type === "recharge" || storeOrder.license_type === "credits") {
      // Marca como pago (recebemos o PIX), agora tenta cobrar custo do revendedor
      await admin.from("storefront_orders").update({
        status: "paid",
        paid_at: paidAt,
        raw_response: payload,
      }).eq("id", storeOrder.id);

      await recordMisticPayFee(admin, txId, "storefront_credits", storeOrder.id, `Loja: ${storeOrder.credit_amount ?? 0} créditos #${storeOrder.short_code ?? String(storeOrder.id).slice(0,8)}`, paidAt, feeCents);

      // Calcula custo do pacote para o revendedor
      let credits_cost = 0;
      let credits_promo_id: string | null = null;
      let credits_promo_discount = 0;
      try {
        const credits = Number(storeOrder.credit_amount ?? 0);
        if (credits > 0) {
          const { data: plan } = await admin
            .from("credit_pricing_plans")
            .select("id")
            .eq("credits_amount", credits)
            .eq("is_active", true)
            .maybeSingle();
          if (plan?.id) {
            const { data: c } = await admin.rpc("get_credit_pack_cost", {
              _reseller_id: storeOrder.reseller_id,
              _plan_id: plan.id,
            });
            const baseCost = Number(c ?? 0);
            const promo = await computeDiscount(admin, baseCost, "credits");
            credits_cost = promo.finalCents;
            credits_promo_id = promo.promotionId;
            credits_promo_discount = promo.discountCents;
          }
        }
      } catch (e) {
        console.warn("get_credit_pack_cost failed", e);
      }

      if (credits_cost > 0) {
        const { data: debitOk, error: debitErr } = await admin.rpc("debit_reseller_balance_promo", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: credits_cost,
          _kind: "order_debit",
          _description: `Venda Loja: ${storeOrder.credit_amount ?? 0} créditos`,
          _reference_id: storeOrder.id,
          _promotion_id: credits_promo_id,
        });

        if (debitErr) {
          // Erro técnico no RPC — NÃO trata como "sem saldo".
          // Devolve 500 para o gateway tentar novamente o webhook.
          console.error("[webhook] debit_reseller_balance RPC error (credits)", debitErr);
          return json({ ok: false, error: "debit_rpc_failed", detail: debitErr.message }, 500);
        }

        if (debitOk === false) {
          // Sem saldo → aguarda recarga
          await admin.from("storefront_orders").update({
            status: "awaiting_balance",
            cost_cents: credits_cost,
            promotion_id: credits_promo_id,
            promotion_discount_cents: credits_promo_discount,
          }).eq("id", storeOrder.id);

          await admin.from("pending_storefront_charges").insert({
            order_id: storeOrder.id,
            reseller_id: storeOrder.reseller_id,
            cost_cents: credits_cost,
            product_type: "credits",
          });

          return json({ ok: true, kind: "storefront_credits_awaiting_balance" });
        }

        await admin.rpc("add_reseller_spent", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: credits_cost,
        });
      }

      // === Cria o pedido no provedor de créditos para gerar o link do cliente ===
      const prov = await createProviderCreditOrder(admin, storeOrder, credits_cost);
      if (!prov.ok) {
        // Refund e marca como falha — buyer pagou mas não conseguimos entregar
        if (credits_cost > 0) {
          await admin.rpc("credit_reseller_balance", {
            _reseller_id: storeOrder.reseller_id,
            _amount_cents: credits_cost,
            _kind: "order_refund",
            _description: `Estorno (falha provedor créditos): ${storeOrder.id}`,
            _reference_id: storeOrder.id,
          });
        }
        await admin.from("storefront_orders").update({
          status: "failed",
          cost_cents: credits_cost,
          error_message: prov.error,
          raw_response: (prov as any).providerData ?? payload,
        }).eq("id", storeOrder.id);
        return json({ ok: false, kind: "storefront_credits_provider_failed", error: prov.error }, 502);
      }

      const inviteLink = `/recargas/${prov.providerPedidoId}`;
      await admin.from("storefront_orders").update({
        status: "completed",
        cost_cents: credits_cost,
        invite_link: inviteLink,
        promotion_id: credits_promo_id,
        promotion_discount_cents: credits_promo_discount,
      }).eq("id", storeOrder.id);

      try {
        await admin.from("orders").insert({
          reseller_id: storeOrder.reseller_id,
          client_id: null,
          customer_id: null,
          extension_id: null,
          license_type: "credits",
          product_type: "credits",
          credit_amount: storeOrder.credit_amount,
          price_cents: credits_cost,
          status: "completed",
          is_test: false,
          provider_response: payload,
          notes: `Venda da Loja • ${storeOrder.buyer_name} • ${storeOrder.credit_amount ?? 0} créditos • Recebido R$ ${(Number(storeOrder.price_cents) / 100).toFixed(2)} • Provedor: ${prov.providerPedidoId}`,
        });
      } catch (e) {
        console.warn("orders insert (storefront credits) failed", e);
      }

      return json({ ok: true, kind: "storefront_credits", invite_link: inviteLink });
    }

    // Mark paid then provision
    await admin.from("storefront_orders").update({
      status: "paid",
      paid_at: paidAt,
      raw_response: payload,
    }).eq("id", storeOrder.id);

    await recordMisticPayFee(admin, txId, "storefront_license", storeOrder.id, `Loja: ${storeOrder.license_type ?? "licença"} #${storeOrder.short_code ?? String(storeOrder.id).slice(0,8)}`, paidAt, feeCents);

    // Lovax é o único método ativo. Flow descontinuado — toda entrega vai por Lovax.
    const method: "lovax" = "lovax";

    // Modo de venda do revendedor (pack/saldo) — Loja Integrada
    const { data: resellerCfg } = await admin
      .from("resellers")
      .select("billing_mode, delivery_source")
      .eq("id", storeOrder.reseller_id)
      .maybeSingle();
    const deliveryFromPack =
      (resellerCfg as any)?.billing_mode === "pack" &&
      (resellerCfg as any)?.delivery_source === "pack";

    // CUSTO DO REVENDEDOR — mesma lógica do place-reseller-order:
    // 1) reseller_extension_price_overrides (Partners) — prioridade máxima
    // 2) tier_extension_prices (preço fixo do nível) — ignora desconto% e piso global
    // 3) reseller_extension_prices (override por extensão) + desconto do nível + piso global
    // 4) pricing_plans.price_cents + desconto do nível + piso global
    let cost_cents = 0;
    let lic_promo_id: string | null = null;
    let lic_promo_discount = 0;
    {
      let tier_price_override = 0;

      if (storeOrder.extension_id) {
        const { data: partnerRow } = await admin
          .from("reseller_extension_price_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("extension_id", storeOrder.extension_id)
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();
        if (partnerRow && partnerRow.is_active && partnerRow.price_cents >= 0) {
          tier_price_override = Number(partnerRow.price_cents);
        }
      } else {
        // Pacote global da loja (extension_id NULL): aplica o MENOR override
        // de Partners ativo do revendedor para esse license_type, se existir.
        const { data: partnerRows } = await admin
          .from("reseller_extension_price_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("license_type", storeOrder.license_type)
          .eq("is_active", true);
        if (partnerRows && partnerRows.length > 0) {
          const min = Math.min(...partnerRows.map((r: any) => Number(r.price_cents)).filter((n: number) => n >= 0));
          if (Number.isFinite(min)) tier_price_override = min;
        }
      }

      const { data: tierRow } = await admin.rpc("get_reseller_tier", {
        _reseller_id: storeOrder.reseller_id,
      });
      const tier: any = Array.isArray(tierRow) ? tierRow[0] : tierRow;

      if (tier?.id && !storeOrder.extension_id) {
        // Fonte única: tier_license_prices via RPC (fallback Ouro embutido).
        const { data: c } = await admin.rpc("get_license_pack_cost", {
          _reseller_id: storeOrder.reseller_id,
          _duration_code: storeOrder.license_type,
        });
        const cN = Number(c ?? 0);
        if (cN > 0) tier_price_override = cN;
      }

      if (tier_price_override === 0 && tier?.id && storeOrder.extension_id) {
        const { data: tep } = await admin
          .from("tier_extension_prices")
          .select("price_cents,is_active")
          .eq("tier_id", tier.id)
          .eq("extension_id", storeOrder.extension_id)
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();
        if (tep && tep.is_active && tep.price_cents >= 0) {
          tier_price_override = Number(tep.price_cents);
        }
      }

      if (tier_price_override > 0) {
        cost_cents = tier_price_override;
      } else {
        let base_price_cents = 0;
        let min_price_cents = 0;

        // Busca preço customizado do revendedor (global ou por extensão)
        const { data: overrideRow } = await admin.from("reseller_extension_prices")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("license_type", storeOrder.license_type)
          .or(storeOrder.extension_id ? `extension_id.eq.${storeOrder.extension_id},extension_id.is.null` : 'extension_id.is.null')
          .eq("is_active", true)
          .order("extension_id", { ascending: false });

        if (overrideRow && overrideRow.length > 0 && overrideRow[0].price_cents > 0) {
          base_price_cents = Number(overrideRow[0].price_cents);
        }

        const { data: planRow } = await admin
          .from("pricing_plans")
          .select("price_cents,min_price_cents")
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();

        if (base_price_cents === 0 && planRow) {
          base_price_cents = Number(planRow.price_cents ?? 0);
        }
        min_price_cents = Number(planRow?.min_price_cents ?? 0);

        if (base_price_cents > 0) {
          const discountPct = Number(tier?.discount_percent ?? 0);
          const discounted = Math.round(base_price_cents * (1 - discountPct / 100));
          cost_cents = Math.max(0, min_price_cents, discounted);
        }
      }
    }

    // Aplica desconto promocional (extensão) sobre o custo final do revendedor
    if (cost_cents > 0) {
      const promo = await computeDiscount(admin, cost_cents, "extension");
      cost_cents = promo.finalCents;
      lic_promo_id = promo.promotionId;
      lic_promo_discount = promo.discountCents;
    }

    // Cobrança: tenta pacote primeiro quando aplicável; fallback automático para saldo.
    let usedPack = false;
    let fallbackFromPack = false;
    if (deliveryFromPack) {
      const { data: consumed, error: consumeErr } = await admin.rpc(
        "pack_try_consume_sale_credit",
        {
          _reseller_id: storeOrder.reseller_id,
          _order_id: storeOrder.id,
          _description: `Venda Loja: ${storeOrder.license_type}`,
        },
      );
      if (consumeErr) {
        console.error("[webhook] pack_try_consume_sale_credit error", consumeErr);
        return json({ ok: false, error: "pack_rpc_failed", detail: consumeErr.message }, 500);
      }
      if (typeof consumed === "number" && consumed >= 0) {
        usedPack = true;
      } else {
        fallbackFromPack = true;
      }
    }

    if (!usedPack && cost_cents > 0) {
      const debitRpc = fallbackFromPack
        ? "debit_reseller_balance_pack_fallback"
        : "debit_reseller_balance_promo";
      const { data: debitOk, error: debitErr } = await admin.rpc(debitRpc, {
        _reseller_id: storeOrder.reseller_id,
        _amount_cents: cost_cents,
        _kind: "order_debit",
        _description: fallbackFromPack
          ? `Venda Loja: ${storeOrder.license_type} (fallback pacote esgotado)`
          : `Venda Loja: ${storeOrder.license_type}`,
        _reference_id: storeOrder.id,
        _promotion_id: lic_promo_id,
      });

      if (debitErr) {
        console.error("[webhook] debit_reseller_balance RPC error (license)", debitErr);
        return json({ ok: false, error: "debit_rpc_failed", detail: debitErr.message }, 500);
      }

      if (debitOk === false) {
        // Fallback reverso: saldo insuficiente -> tenta consumir 1 crédito do
        // pacote antes de deixar a venda em `awaiting_balance`. Sem loop:
        // executado no máximo 1x por venda (webhook é idempotente por status).
        const { data: fbConsumed, error: fbErr } = await admin.rpc(
          "pack_try_consume_sale_credit",
          {
            _reseller_id: storeOrder.reseller_id,
            _order_id: storeOrder.id,
            _description: `Venda Loja: ${storeOrder.license_type} (fallback saldo insuficiente)`,
          },
        );
        if (fbErr) {
          console.error("[webhook] pack fallback rpc error", fbErr);
        } else if (typeof fbConsumed === "number" && fbConsumed >= 0) {
          usedPack = true;
        }

        if (!usedPack) {
          await admin.from("storefront_orders").update({
            status: "awaiting_balance",
            cost_cents,
            promotion_id: lic_promo_id,
            promotion_discount_cents: lic_promo_discount,
          }).eq("id", storeOrder.id);

          await admin.from("pending_storefront_charges").insert({
            order_id: storeOrder.id,
            reseller_id: storeOrder.reseller_id,
            cost_cents,
            product_type: "license",
          });

          return json({ ok: true, kind: "storefront_order_awaiting_balance" });
        }
      } else {
        await admin.rpc("add_reseller_spent", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: cost_cents,
        });
      }
    }

    let providerData: any = null;
    let license_key: string | null = null;
    try {
      if (method === "lovax") {
        const { data: settings } = await admin
          .from("app_settings")
          .select("key, value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
        if (!tk) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: "MétodoLovax não configurado",
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (Lovax não configurado): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          if (usedPack) {
            await admin.rpc("pack_refund_credit", {
              _reseller_id: storeOrder.reseller_id,
              _order_id: storeOrder.id,
              _description: `Estorno pack (Lovax não configurado): ${storeOrder.id}`,
            });
          }
          return json({ ok: false, error: "lovax not configured" }, 500);
        }
        const mapped = mapTypeToProviderBody(storeOrder.license_type);
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_license",
            payload: {
              customer_name: storeOrder.buyer_name,
              days: (mapped as any).days ?? 30,
              hours: 0,
              minutes: 0,
              max_devices: 1,
            },
          }),
        });
        const txt = await r.text();
        try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
        if (!r.ok || !providerData?.success) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: providerData?.error ?? `Lovax retornou ${r.status}`,
            raw_response: providerData,
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (falha Lovax): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          if (usedPack) {
            await admin.rpc("pack_refund_credit", {
              _reseller_id: storeOrder.reseller_id,
              _order_id: storeOrder.id,
              _description: `Estorno pack (falha Lovax): ${storeOrder.id}`,
            });
          }
          return json({ ok: false, error: "lovax failed" }, 502);
        }
        license_key =
          providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      } else {
        const { data: cfg } = await admin.from("provider_settings")
          .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_PROVIDER_BASE;
        if (!apiKey) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: "MétodoFlow não configurado",
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (Flow não configurado): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          if (usedPack) {
            await admin.rpc("pack_refund_credit", {
              _reseller_id: storeOrder.reseller_id,
              _order_id: storeOrder.id,
              _description: `Estorno pack (Flow não configurado): ${storeOrder.id}`,
            });
          }
          return json({ ok: false, error: "no provider api key" }, 500);
        }
        if (FLOW_DISALLOWED_TYPES.has(storeOrder.license_type)) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: "Pacote indisponível para MétodoFlow (90d/365d desativado)",
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (pacote ${storeOrder.license_type} indisponível no Flow): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          if (usedPack) {
            await admin.rpc("pack_refund_credit", {
              _reseller_id: storeOrder.reseller_id,
              _order_id: storeOrder.id,
              _description: `Estorno pack (pacote ${storeOrder.license_type} indisponível): ${storeOrder.id}`,
            });
          }
          return json({ ok: false, error: "pack not supported by flow" }, 400);
        }
        const r = await fetch(`${base}/generate-license`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...mapTypeToProviderBody(storeOrder.license_type),
            display_name: storeOrder.buyer_name,
          }),
        });
        const txt = await r.text();
        try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
        if (!r.ok) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: `MétodoFlow retornou ${r.status}`,
            raw_response: providerData,
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (falha Flow): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          if (usedPack) {
            await admin.rpc("pack_refund_credit", {
              _reseller_id: storeOrder.reseller_id,
              _order_id: storeOrder.id,
              _description: `Estorno pack (falha Flow ${r.status}): ${storeOrder.id}`,
            });
          }
          return json({ ok: false, error: "provider failed" }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await admin.from("storefront_orders").update({
        status: "failed",
        error_message: e instanceof Error ? e.message : "erro provedor",
      }).eq("id", storeOrder.id);
      if (usedPack) {
        await admin.rpc("pack_refund_credit", {
          _reseller_id: storeOrder.reseller_id,
          _order_id: storeOrder.id,
          _description: `Estorno pack (exceção provedor): ${storeOrder.id}`,
        });
      } else if (cost_cents > 0) {
        await admin.rpc("credit_reseller_balance", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: cost_cents,
          _kind: "order_refund",
          _description: `Estorno (exceção provedor): ${storeOrder.id}`,
          _reference_id: storeOrder.id,
        });
      }
      return json({ ok: false, error: "provider error" }, 502);
    }

    await admin.from("storefront_orders").update({
      status: "completed",
      license_key,
      cost_cents,
      promotion_id: lic_promo_id,
      promotion_discount_cents: lic_promo_discount,
      delivery_source: deliveryFromPack
        ? (usedPack ? "pack" : "wallet_fallback")
        : "wallet",
      fallback_from_pack: fallbackFromPack,
    }).eq("id", storeOrder.id);

    // upsert customer for the reseller
    let customer_id: string | null = null;
    try {
      const { data: existing } = await admin
        .from("reseller_customers")
        .select("id")
        .eq("reseller_id", storeOrder.reseller_id)
        .eq("whatsapp", storeOrder.buyer_whatsapp)
        .maybeSingle();
      if (existing) {
        customer_id = existing.id;
      } else {
        const { data: created } = await admin.from("reseller_customers").insert({
          reseller_id: storeOrder.reseller_id,
          whatsapp: storeOrder.buyer_whatsapp,
          display_name: storeOrder.buyer_name,
        }).select("id").single();
        customer_id = created?.id ?? null;
      }
    } catch (e) {
      console.warn("customer upsert failed", e);
    }

    // Registra também em `orders` para aparecer no dashboard / licenças geradas
    try {
      await admin.from("orders").insert({
        reseller_id: storeOrder.reseller_id,
        client_id: null,
        customer_id,
        extension_id: storeOrder.extension_id,
        license_type: storeOrder.license_type,
        price_cents: cost_cents, // custo para o revendedor (mesma base do painel)
        status: "completed",
        is_test: false,
        license_key,
        provider_response: providerData,
        promotion_id: lic_promo_id,
        promotion_discount_cents: lic_promo_discount,
        notes: JSON.stringify({
          source: "storefront",
          display_name: storeOrder.buyer_name,
          whatsapp: storeOrder.buyer_whatsapp ?? null,
          received_cents: Number(storeOrder.price_cents) || 0,
          storefront_order_id: storeOrder.id,
          storefront_short_code: storeOrder.short_code ?? null,
          billing_mode: (resellerCfg as any)?.billing_mode ?? "normal",
          delivery_source: deliveryFromPack
            ? (usedPack ? "pack" : "wallet_fallback")
            : "wallet",
          fallback_from_pack: fallbackFromPack,
        }),
      });
    } catch (e) {
      console.warn("orders insert (storefront) failed", e);
    }

    // Se a loja usou Pack, o trigger do ledger do Pack já cria a notificação única
    // com os dados da venda. Não envie uma segunda notificação de "saldo/carteira".
    if (!usedPack) {
      await notifyTelegramStorefrontLicenseSale(admin, storeOrder, license_key, cost_cents);
    }

    // Disparo WhatsApp para o revendedor (Notificação de Venda na Loja)
    if (license_key && storeOrder.reseller_id) {
      const event_key = usedPack ? "reseller_sale_pack" : "reseller_sale_store";
      
      let licencas_restantes = "";
      if (usedPack) {
        const { data: packBal } = await admin.from("reseller_pack_balances")
          .select("credits").eq("reseller_id", storeOrder.reseller_id).maybeSingle();
        licencas_restantes = String(packBal?.credits ?? "0");
      }

      await triggerWhatsAppNotify({
        event_key,
        reseller_id: storeOrder.reseller_id,
        vars: {
          pedido_id: storeOrder.id.slice(0, 8).toUpperCase(),
          cliente_nome: storeOrder.buyer_name,
          cliente_whatsapp: storeOrder.buyer_whatsapp ? `+${storeOrder.buyer_whatsapp}` : "N/A",
          licenca: license_key,
          custo: (cost_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          licencas_restantes,
          canal: "Loja Pública",
          prazo: mapLicenseTypeToDuration(storeOrder.license_type),
        },
      });
    }

    // Disparo WhatsApp para o CLIENTE (fire-and-forget)
    if (license_key && storeOrder.buyer_whatsapp) {
      fetch(`${SUPABASE_URL}/functions/v1/evolution-send-sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          reseller_id: storeOrder.reseller_id,
          kind: "storefront",
          to: storeOrder.buyer_whatsapp,
          vars: {
            nome: storeOrder.buyer_name,
            chave: license_key,
            tipo: storeOrder.license_type,
            valor_cents: String(storeOrder.price_cents),
          },
        }),
      }).catch((e) => console.warn("evolution-send-sale (storefront) failed", e));
    }

    return json({ ok: true, kind: "storefront_order" });
  } catch (e) {
    console.error("webhook error", e);
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
