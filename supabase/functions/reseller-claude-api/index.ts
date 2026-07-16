// Public reseller-facing Claude API. Auth via header `X-API-Key: lov_live_...`
// Endpoints (path after /reseller-claude-api):
//   GET  /status              -> health + claude_enabled flag
//   GET  /planos              -> catalog with prices for this reseller
//   GET  /saldo               -> wallet balance (BRL cents)
//   POST /chaves              -> issue Claude key. Body: { plano: "<plan_code>", id_cliente?: string }
//   GET  /chaves              -> list recent orders (max 50)
//   GET  /chaves/{id}         -> get a specific order (no `code` field)
//   POST /chaves/{id}/cancelar -> cancel key. { force?: boolean }
//                                Refund window: 7 days from created_at.
//   GET  /chaves/{id}/consumo -> token usage snapshot from the provider (best-effort)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY") ?? "";
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const PLAN_CODES = new Set(["pro_30d", "5x_30d", "20x_30d", "api_500k_30d", "api_25m_30d", "api_10m_30d"]);
const PLAN_LABELS: Record<string, string> = {
  "pro_30d":  "Pro · 30 dias",
  "5x_7d":    "Max 5X · 7 dias",
  "5x_30d":   "Max 5X · 30 dias",
  "20x_30d":  "Max 20X · 30 dias",
  "api_500k_30d": "Pro · 30 dias",
  "api_25m_30d": "Max 5X · 30 dias",
  "api_10m_30d": "Max 20X · 30 dias",
};
const fmtBRL = (c: number) => "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithBackoff(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === tries - 1) return response;
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 500 * Math.pow(2, attempt);
      await wait(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt === tries - 1) throw error;
      await wait(500 * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getWebhookConfig(svc: any, resellerId: string) {
  // Configuração atual: linha interna dedicada ao webhook. Ela fica inativa para
  // não ser aceita como API key, mas continua sendo a fonte oficial do webhook.
  const { data: dedicated } = await svc
    .from("reseller_claude_api_keys")
    .select("id, webhook_url, webhook_secret")
    .eq("reseller_id", resellerId)
    .eq("label", "__webhook_config__")
    .not("webhook_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dedicated?.webhook_url) return dedicated;

  // Compatibilidade com registros antigos, quando o webhook ficava em uma API key ativa.
  const { data: legacy } = await svc
    .from("reseller_claude_api_keys")
    .select("id, webhook_url, webhook_secret")
    .eq("reseller_id", resellerId)
    .eq("is_active", true)
    .not("webhook_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return legacy;
}

async function dispatchWebhook(svc: any, resellerId: string, event: string, payload: Record<string, unknown>) {
  const data = await getWebhookConfig(svc, resellerId);
  if (!data?.webhook_url) return { delivered: false, reason: "no_webhook_configured" };
  const body = JSON.stringify({ event, ...payload, sent_at: new Date().toISOString() });
  const sig = data.webhook_secret ? `sha256=${await hmacSha256Hex(data.webhook_secret, body)}` : "";
  try {
    const r = await fetch(data.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LovConnect-Webhook/1.0",
        ...(sig ? { "X-Signature": sig } : {}),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { delivered: r.ok, status: r.status };
  } catch (e) {
    return { delivered: false, error: String((e as Error)?.message ?? e) };
  }
}

function computeSale(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

async function resolveResellerClaudeCost(svc: any, resellerId: string, planCode: string, fallbackCents: number) {
  try {
    const { data } = await svc.rpc("get_reseller_claude_cost", {
      _reseller_id: resellerId,
      _plan_code: planCode,
    });
    if (typeof data === "number" && data > 0) return data;
  } catch (_) { /* fallback below */ }
  return fallbackCents;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    {{
      const _maintClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const _maintResp = await maintenanceGuard(_maintClient, corsHeaders);
      if (_maintResp) return _maintResp;
    }}

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.findIndex((s) => s === "reseller-claude-api");
  const route = idx >= 0 ? segments.slice(idx + 1) : segments;
  const action = route[0] ?? "";
  const subId = route[1] ?? "";

  // ---- Auth ----
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey || apiKey.length < 10) return json({ success: false, error: "Missing X-API-Key" }, 401);

  const keyHash = await sha256Hex(apiKey);
  // Aceita chaves criadas em "reseller_claude_api_keys" (nova página dedicada do Claude)
  // ou nas chaves genéricas legadas em "reseller_api_keys" (compatibilidade).
  let keyRow: any = null;
  {
    const { data } = await svc
      .from("reseller_claude_api_keys")
      .select("id, reseller_id, is_active, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    keyRow = data;
  }
  let keyTable = "reseller_claude_api_keys";
  if (!keyRow) {
    const { data } = await svc
      .from("reseller_api_keys")
      .select("id, reseller_id, is_active, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();
    keyRow = data;
    keyTable = "reseller_api_keys";
  }
  if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
    return json({ success: false, error: "API Key inválida ou revogada" }, 401);
  }

  const { data: reseller } = await svc
    .from("resellers")
    .select("id, is_active, claude_enabled, activation_status, display_name")
    .eq("id", keyRow.reseller_id)
    .maybeSingle();
  if (!reseller || !reseller.is_active) return json({ success: false, error: "Revendedor inativo" }, 403);
  if (reseller.activation_status && reseller.activation_status !== "active") {
    return json({ success: false, error: "activation_required" }, 403);
  }
  if (!reseller.claude_enabled) return json({ success: false, error: "Claude API não habilitada para este revendedor" }, 403);

  await svc.from(keyTable).update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  const resolvePrices = async () => {
    const [{ data: def }, { data: ov }] = await Promise.all([
      svc.from("claude_plan_prices").select("*"),
      svc.from("claude_reseller_price_overrides").select("*").eq("reseller_id", reseller.id),
    ]);
    const rows = await Promise.all(Array.from(PLAN_CODES).map(async (pc) => {
      const base: any = (def ?? []).find((x: any) => x.plan_code === pc);
      if (!base || !base.is_active) return null;
      const override: any = (ov ?? []).find((x: any) => x.plan_code === pc && x.is_active);
      const sale = override
        ? computeSale(base.cost_cents, override.markup_mode, override.markup_value_cents)
        : base.sale_price_cents;
      const fallbackCost = (base as any).reseller_cost_cents ?? base.sale_price_cents;
      const resellerCost = await resolveResellerClaudeCost(svc, reseller.id, pc, fallbackCost);
      return { plano: pc, preco_centavos: resellerCost, preco: (resellerCost / 100).toFixed(2), preco_venda_centavos: sale, disponivel: true };
    }));
    return rows.filter(Boolean);
  };

  try {
    // ---- Routes ----
    if (action === "status" && req.method === "GET") {
      return json({ success: true, claude_enabled: true });
    }

    if (action === "planos" && req.method === "GET") {
      return json({ success: true, planos: await resolvePrices() });
    }

    if (action === "saldo" && req.method === "GET") {
      const { data: bal } = await svc.from("reseller_balances").select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
      const cents = bal?.balance_cents ?? 0;
      return json({ success: true, saldo_centavos: cents, saldo: (cents / 100).toFixed(2) });
    }

    if (action === "chaves" && req.method === "GET" && !subId) {
      const { data } = await svc
        .from("claude_orders")
        .select("id, plan_code, status, sale_price_cents, provider_key_id, created_at, error_message")
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ success: true, chaves: data ?? [] });
    }

    if (action === "chaves" && req.method === "GET" && subId) {
      const { data } = await svc
        .from("claude_orders")
        // Doc: GET /chaves/{id} NÃO devolve o `code` (credencial secreta —
        // exposto apenas na resposta do POST /chaves em uso único).
        .select("id, plan_code, status, sale_price_cents, provider_key_id, customer_email, customer_name, customer_whatsapp, created_at, redeemed_at, expired_at, cancelled_at, tokens_exhausted_at, is_renewal, error_message")
        .eq("reseller_id", reseller.id)
        .eq("id", subId)
        .maybeSingle();
      if (!data) return json({ success: false, error: "Pedido não encontrado" }, 404);
      return json({ success: true, chave: data });
    }

    // GET /chaves/{id}/consumo — token usage snapshot from provider (best-effort)
    if (action === "chaves" && req.method === "GET" && subId && (route[2] ?? "") === "consumo") {
      const { data: order } = await svc
        .from("claude_orders")
        .select("id, plan_code, status, provider_key_id, code, provider_api_key, customer_email, created_at")
        .eq("reseller_id", reseller.id)
        .eq("id", subId)
        .maybeSingle();
      if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);

      let providerUser: any = null;
      let providerError: string | null = null;
      if (CLAUDE_BASE_URL && CLAUDE_API_KEY) {
        try {
          const r = await fetchWithBackoff(`${CLAUDE_BASE_URL}/api/rsl/users`, {
            headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
          });
          const txt = await r.text();
          let parsed: any = null;
          try { parsed = JSON.parse(txt); } catch {}
          if (r.ok) {
            const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
            const emailLower = String(order.customer_email ?? "").toLowerCase();
            const providerIds = new Set(
              [(order as any).provider_key_id, (order as any).code, (order as any).provider_api_key]
                .map((v: any) => String(v ?? "").trim())
                .filter(Boolean),
            );
            const matchById = (u: any) => {
              const candidates = [u?.id, u?.credential, u?.key, u?.code, u?.apiKey, u?.api_key, u?.keyId, u?.key_id, u?.userId, u?.user_id]
                .map((v: any) => String(v ?? "").trim())
                .filter(Boolean);
              return candidates.some((c) => providerIds.has(c));
            };
            providerUser =
              list.find(matchById) ??
              (emailLower ? list.find((u: any) => String(u?.email ?? "").toLowerCase() === emailLower) : null) ??
              null;
          } else {
            providerError = `provider_${r.status}`;
          }
        } catch (e) {
          providerError = String((e as Error)?.message ?? e);
        }
      } else {
        providerError = "provider_not_configured";
      }

      const consumo = providerUser
        ? {
            status: providerUser.status ?? null,
            expira_em: providerUser.accountExpiresAt ?? null,
            resgatada_em: providerUser.redeemedAt ?? null,
            tokens_consumidos: providerUser?.usage?.tokensConsumed ?? null,
            tokens_janela: providerUser?.usage?.tokensInWindow ?? null,
            tokens_limite: providerUser?.usage?.tokenLimit ?? null,
            janela_horas: providerUser?.usage?.tokenWindowHours ?? null,
            percentual_usado_dia: providerUser?.usage?.dailyPercentUsed ?? null,
            percentual_restante: providerUser?.usage?.percentRemaining ?? null,
            tokens_janela_semanal: providerUser?.usage?.weeklyTokensInWindow ?? null,
            tokens_limite_semanal: providerUser?.usage?.weeklyTokenLimit ?? null,
          }
        : null;

      return json({ success: true, consumo, provider_error: providerError });
    }


    // POST /chaves/{id}/cancelar — cancela chave com regra dos 7 dias
    if (action === "chaves" && req.method === "POST" && subId && (route[2] ?? "") === "cancelar") {
      const body = await req.json().catch(() => ({}));
      const force = Boolean(body?.force);
      const REFUND_WINDOW_DAYS = 7;

      const { data: order } = await svc
        .from("claude_orders")
        .select("id, status, plan_code, cost_cents, provider_key_id, code, created_at, cancel_attempts, customer_name, customer_whatsapp")
        .eq("reseller_id", reseller.id)
        .eq("id", subId)
        .maybeSingle();
      if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);
      // Permite cancelar chaves emitidas (issued), já resgatadas (redeemed)
      // e com pedido de cancelamento pendente (cancel_requested).
      if (!["issued", "redeemed", "cancel_requested"].includes(order.status)) {
        return json({ success: false, error: "invalid_status", status: order.status }, 409);
      }

      const providerKeyRef = String(order.provider_key_id ?? order.code ?? "").trim();
      if (!providerKeyRef) return json({ success: false, error: "missing_provider_key_id" }, 422);
      if (!CLAUDE_BASE_URL) return json({ success: false, error: "provider_not_configured" }, 500);

      const ageDays = (Date.now() - new Date(order.created_at).getTime()) / 86_400_000;
      const withinWindow = ageDays <= REFUND_WINDOW_DAYS;
      if (!withinWindow && !force) {
        return json({
          success: false,
          error: "refund_window_expired",
          message: `Prazo de ${REFUND_WINDOW_DAYS} dias expirado. Reenvie com force=true para cancelar sem estorno.`,
          age_days: Math.floor(ageDays),
          refund_window_days: REFUND_WINDOW_DAYS,
        }, 409);
      }

      let providerResp: any = null; let providerStatus = 0;
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys/${encodeURIComponent(providerKeyRef)}/cancel`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(15000),
        });
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        return json({ success: false, error: "provider_network_error", detail: (e as Error).message }, 502);
      }
      if (providerStatus < 200 || providerStatus >= 300) {
        // 409 = já cancelada/reembolsada no provedor — sincroniza estado local.
        if (providerStatus === 409) {
          const provStatus = String(providerResp?.status ?? "").toLowerCase();
          const errMsg = String(providerResp?.error ?? providerResp?.message ?? "").toLowerCase();
          const alreadyCancelled =
            provStatus === "cancelled" ||
            provStatus === "refunded" ||
            /cancel|reembols|refund/.test(errMsg);
          if (alreadyCancelled) {
            const { data: existingRefund } = await svc
              .from("balance_transactions")
              .select("id")
              .eq("reseller_id", reseller.id)
              .eq("reference_id", order.id)
              .eq("kind", "claude_key_refund")
              .maybeSingle();
            let refundCents = 0;
            if (!existingRefund && withinWindow) {
              const { data: issueTx } = await svc
                .from("balance_transactions")
                .select("amount_cents")
                .eq("reseller_id", reseller.id)
                .eq("reference_id", order.id)
                .eq("kind", "claude_key_issue")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              const debited = issueTx ? Math.abs(Number((issueTx as any).amount_cents) || 0) : 0;
              refundCents = debited > 0 ? debited : (Number(order.cost_cents) || 0);
              if (refundCents > 0) {
                await svc.rpc("credit_reseller_balance", {
                  _reseller_id: reseller.id,
                  _amount_cents: refundCents,
                  _kind: "claude_key_refund",
                  _description: `Estorno cancelamento Claude (sync provedor ${order.id})`,
                  _reference_id: order.id,
                });
              }
            }
            await svc.from("claude_orders").update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              refund_waived: !withinWindow && !existingRefund,
            }).eq("id", order.id);
            return json({
              success: true,
              synced: true,
              order_id: order.id,
              refund_cents: refundCents,
              message: "Chave já estava cancelada no provedor — status sincronizado.",
            });
          }
        }
        await svc.from("claude_orders").update({
          status: "cancel_failed",
          provider_response: providerResp,
        }).eq("id", order.id);
        return json({ success: false, error: "provider_error", status: providerStatus, body: providerResp }, 502);
      }

      // Estorna EXATAMENTE o valor debitado do revendedor na emissão
      // (reseller_cost_cents na época da venda). Não usar `order.cost_cents`
      // (custo do fornecedor) nem `refunded_amount_cents` do provider — esses
      // podem ser menores que o valor cobrado do revendedor.
      const { data: issueTx } = await svc
        .from("balance_transactions")
        .select("amount_cents")
        .eq("reseller_id", reseller.id)
        .eq("reference_id", order.id)
        .eq("kind", "claude_key_issue")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const debitedCents = issueTx ? Math.abs(Number(issueTx.amount_cents) || 0) : 0;
      const baseRefund = debitedCents > 0
        ? debitedCents
        : (Number(order.cost_cents) || 0);
      const refundCents = withinWindow ? baseRefund : 0;
      if (refundCents > 0) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller.id,
          _amount_cents: refundCents,
          _kind: "claude_key_refund",
          _description: `Estorno cancelamento Claude (pedido ${order.id})`,
          _reference_id: order.id,
        });
      }
      await svc.from("claude_orders").update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        refund_waived: !withinWindow,
      }).eq("id", order.id);

      // Notifica gerente via Telegram
      try {
        const { data: rInfo } = await svc.from("resellers").select("display_name").eq("id", reseller.id).maybeSingle();
        const planLabel = PLAN_LABELS[(order as any).plan_code] ?? (order as any).plan_code ?? "—";
        const txt =
          `↩️ <b>Cancelamento Claude (API)</b>\n` +
          `👨‍💼 Revendedor: ${(rInfo as any)?.display_name ?? "—"}\n` +
          `📦 Plano: ${planLabel}\n` +
          `👤 Cliente: ${(order as any).customer_name ?? "—"}` +
          ((order as any).customer_whatsapp ? ` (${(order as any).customer_whatsapp})` : "") +
          `\n💵 Estorno: ${refundCents > 0 ? fmtBRL(refundCents) : "sem estorno (fora do prazo)"}\n` +
          `⏱ Prazo: ${Math.floor(ageDays)}d / ${REFUND_WINDOW_DAYS}d`;
        await svc.rpc("telegram_enqueue", { _text: txt });
      } catch (e) {
        console.warn("telegram_enqueue (claude api cancel) failed", e);
      }

      return json({
        success: true,
        pedido_id: order.id,
        refund_cents: refundCents,
        refund_waived: !withinWindow,
        age_days: Math.floor(ageDays),
      });
    }

    // POST /chaves/{id}/renovar — renova a chave/cliente por e-mail no fornecedor
    if (action === "chaves" && req.method === "POST" && subId && (route[2] ?? "") === "renovar") {
      if (!CLAUDE_BASE_URL) return json({ success: false, error: "provider_not_configured" }, 500);
      const bodyR = await req.json().catch(() => ({}));
      const requestId = req.headers.get("idempotency-key") || (bodyR?.request_id ? String(bodyR.request_id) : null);

      const { data: origOrder } = await svc
        .from("claude_orders")
        .select("id, plan_code, customer_email, customer_name, customer_whatsapp, customer_identifier, status")
        .eq("reseller_id", reseller.id)
        .eq("id", subId)
        .maybeSingle();
      if (!origOrder) return json({ success: false, error: "Pedido não encontrado" }, 404);

      const emailOverride = bodyR?.email ? String(bodyR.email).trim().toLowerCase().slice(0, 200) : null;
      const email = emailOverride ?? (origOrder.customer_email ? String(origOrder.customer_email).toLowerCase() : null);
      if (!email) return json({ success: false, error: "email_required", message: "O pedido original não tem e-mail; envie 'email' no body." }, 400);

      const planCode = String(origOrder.plan_code);
      if (!PLAN_CODES.has(planCode)) return json({ success: false, error: "invalid_plano" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ success: false, error: "email_obrigatorio", message: "O campo 'email' do cliente é obrigatório e deve ser válido." }, 400);
      }

      // Idempotência
      if (requestId) {
        const { data: prior } = await svc
          .from("claude_orders")
          .select("id, plan_code, status, sale_price_cents, provider_key_id")
          .eq("reseller_id", reseller.id)
          .eq("request_id", requestId)
          .maybeSingle();
        if (prior) return json({ success: true, idempotent: true, pedido: prior });
      }

      const [{ data: defaultPrice }, { data: override }] = await Promise.all([
        svc.from("claude_plan_prices").select("*").eq("plan_code", planCode).maybeSingle(),
        svc.from("claude_reseller_price_overrides").select("*").eq("reseller_id", reseller.id).eq("plan_code", planCode).maybeSingle(),
      ]);
      if (!defaultPrice || !defaultPrice.is_active) return json({ success: false, error: "plano_indisponivel" }, 400);

      const costCents = defaultPrice.cost_cents;
      const resellerCostCents = await resolveResellerClaudeCost(
        svc,
        reseller.id,
        planCode,
        (defaultPrice as any).reseller_cost_cents ?? defaultPrice.sale_price_cents,
      );
      const saleCents = override && override.is_active
        ? computeSale(costCents, override.markup_mode, override.markup_value_cents)
        : defaultPrice.sale_price_cents;
      const profitCents = saleCents - resellerCostCents;

      const { data: balRow } = await svc.from("reseller_balances").select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
      const balance = balRow?.balance_cents ?? 0;
      if (balance < resellerCostCents) {
        return json({
          success: false,
          error: "saldo_insuficiente",
          saldo_centavos: balance,
          preco_centavos: resellerCostCents,
          message: "Recarregue a carteira e reenvie a renovação.",
        }, 402);
      }

      const { data: renewOrder, error: rErr } = await svc.from("claude_orders").insert({
        reseller_id: reseller.id,
        plan_code: planCode,
        customer_identifier: origOrder.customer_identifier,
        customer_name: origOrder.customer_name,
        customer_email: email,
        customer_whatsapp: origOrder.customer_whatsapp,
        cost_cents: costCents,
        sale_price_cents: saleCents,
        profit_cents: profitCents,
        status: "pending",
        request_id: requestId,
        is_renewal: true,
        renewal_note: `Renovação do pedido ${origOrder.id}`,
      }).select().single();
      if (rErr) throw rErr;

      let providerResp: any = null; let providerStatus = 0;
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/renew`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email, kind: planCode }),
        });
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        await svc.from("claude_orders").update({ status: "failed", error_message: `network: ${(e as Error).message}` }).eq("id", renewOrder.id);
        return json({ success: false, error: "provider_network_error" }, 502);
      }
      if (providerStatus < 200 || providerStatus >= 300) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `provider_${providerStatus}`,
        }).eq("id", renewOrder.id);
        return json({ success: false, error: "provider_error", status: providerStatus, body: providerResp }, 502);
      }

      const { data: debited, error: debitErr } = await svc.rpc("debit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: resellerCostCents,
        _kind: "claude_key_renew",
        _description: `Renovação Claude ${planCode} (API)`,
        _reference_id: renewOrder.id,
      });
      if (debitErr || debited !== true) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `debit_failed: ${debitErr?.message ?? "insufficient_balance"}`,
        }).eq("id", renewOrder.id);
        return json({ success: false, error: debitErr ? "debit_failed" : "saldo_insuficiente" }, 402);
      }

      const providerUserId: string | undefined =
        providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;
      await svc.from("claude_orders").update({
        status: "issued",
        provider_response: providerResp,
        provider_user_id: providerUserId ?? null,
        code_revealed_at: new Date().toISOString(),
      }).eq("id", renewOrder.id);

      dispatchWebhook(svc, reseller.id, "claude.key.renewed", {
        pedido_id: renewOrder.id,
        pedido_original_id: origOrder.id,
        plano: planCode,
        preco_centavos: saleCents,
        email,
      }).catch(() => {});

      // WhatsApp automático ao cliente final na renovação (best-effort)
      const waRenew = String((origOrder as any).customer_whatsapp ?? "").replace(/\D+/g, "");
      if (waRenew.length >= 10) {
        try {
          const { data: integ } = await svc
            .from("reseller_integrations")
            .select("evolution_enabled, evolution_send_on_api, connection_status")
            .eq("reseller_id", reseller.id)
            .maybeSingle();
          if (
            integ?.evolution_enabled &&
            (integ as any).evolution_send_on_api !== false &&
            integ?.connection_status === "connected"
          ) {
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-send-sale`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
              },
              body: JSON.stringify({
                reseller_id: reseller.id,
                kind: "claude",
                to: waRenew,
                vars: {
                  nome: (origOrder as any).customer_name ?? "",
                  plano: PLAN_LABELS[planCode] ?? planCode,
                  codigo: "",
                  chave: "",
                  api_key: "",
                  base_url: "https://claude-ss.shardweb.app/",
                  valor_cents: String(saleCents ?? 0),
                },
              }),
            }).catch((e) => console.warn("evolution-send-sale (claude renew) failed", e));
          }
        } catch (e) {
          console.warn("evolution-send-sale (claude renew) lookup failed", e);
        }
      }

      return json({
        success: true,
        pedido_id: renewOrder.id,
        pedido_original_id: origOrder.id,
        plano: planCode,
        preco_centavos: saleCents,
        email,
        provider_response: providerResp,
      });
    }

    // POST /teste — Conta de teste GRATUITA (15 minutos OU 50 mensagens, o que vier primeiro).
    // Não debita saldo. Limite do provedor: 20 testes/dia por conta de revenda (429 no upstream).
    if ((action === "teste" || action === "testes") && req.method === "POST") {
      if (!CLAUDE_BASE_URL) return json({ success: false, error: "provider_not_configured" }, 500);
      const bodyT = await req.json().catch(() => ({}));
      const email = bodyT?.email ? String(bodyT.email).trim().toLowerCase().slice(0, 200) : null;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ success: false, error: "email_obrigatorio", message: "Informe o campo 'email' do cliente." }, 400);
      }
      const customerName = bodyT?.nome ? String(bodyT.nome).trim().slice(0, 120) : null;
      const customerWhatsapp = bodyT?.whatsapp ? String(bodyT.whatsapp).replace(/\D+/g, '').slice(0, 15) : null;

      // Anti-abuso persistente por e-mail / WhatsApp (24h).
      // Observação: o IP aqui é o servidor do revendedor (não o cliente final),
      // então usamos email/whatsapp como controle principal.
      {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const orFilter: string[] = [`name.eq.claude:${email}`];
        if (customerWhatsapp) orFilter.push(`phone.eq.${customerWhatsapp}`);
        const { data: dup } = await svc
          .from("trial_registrations")
          .select("id")
          .or(orFilter.join(","))
          .gte("created_at", since24h)
          .limit(1)
          .maybeSingle();
        if (dup) {
          return json({
            success: false,
            error: "trial_rate_limited",
            message: "Já foi gerado um teste para este e-mail ou WhatsApp nas últimas 24h.",
          }, 429);
        }
      }

      let providerResp: any = null; let providerStatus = 0;
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/test`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email }),
        });
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        return json({ success: false, error: "provider_network_error", detail: (e as Error).message }, 502);
      }
      if (providerStatus < 200 || providerStatus >= 300) {
        // Traduz erros comuns do provedor
        if (providerStatus === 403) {
          return json({ success: false, error: "trial_disabled_by_admin", message: "Recurso de teste não habilitado pelo admin do provedor. Solicite a liberação." }, 403);
        }
        if (providerStatus === 409) {
          return json({ success: false, error: "email_already_has_account", message: "Este e-mail já possui uma conta no provedor." }, 409);
        }
        if (providerStatus === 429) {
          return json({ success: false, error: "provider_daily_limit_reached", message: "Limite diário de 20 testes atingido no provedor. Fale com o admin para liberar mais." }, 429);
        }
        return json({ success: false, error: "provider_error", status: providerStatus, body: providerResp }, 502);
      }

      const code: string | undefined =
        providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
      const providerKeyId: string | undefined =
        providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
      const providerApiKey: string | undefined =
        providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
      const providerUserId: string | undefined =
        providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

      // Registro leve (sem custo)
      await svc.from("claude_orders").insert({
        reseller_id: reseller.id,
        plan_code: "trial_15m_50msg",
        is_trial: true,
        trial_duration_minutes: 15,
        trial_messages_limit: 50,
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        customer_email: email,
        cost_cents: 0,
        sale_price_cents: 0,
        profit_cents: 0,
        status: "issued",
        code,
        provider_key_id: providerKeyId,
        provider_api_key: providerApiKey ?? null,
        provider_user_id: providerUserId ?? null,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
        error_message: "trial_15m_50msg",
      });

      // Registra anti-abuso (e-mail / whatsapp)
      if (code) {
        await svc.from("trial_registrations").insert({
          name: `claude:${email}`,
          phone: customerWhatsapp || "",
          ip_address: "reseller-api",
          license_key: code,
        });
      }

      // Notificação Telegram para o gerente
      try {
        const txt =
          `🧪 <b>Teste Claude (API do revendedor)</b>\n` +
          `🏪 Revendedor: ${reseller.display_name ?? reseller.id}\n` +
          `👤 Cliente: ${customerName ?? '—'}${customerWhatsapp ? ` (${customerWhatsapp})` : ''}\n` +
          `📧 ${email}\n` +
          `👥 User ID: <code>${providerUserId ?? '—'}</code>`;
        await svc.rpc('telegram_enqueue', { _text: txt });
      } catch (_) { /* noop */ }

      return json({
        success: true,
        codigo: code,
        api_key: providerApiKey ?? null,
        user_id: providerUserId ?? null,
        provider_base_url: providerApiKey ? "https://claude-ss.shardweb.app/" : null,
        email,
        trial: { duracao_minutos: 15, mensagens_limite: 50 },
        duracao_minutos: 15,
        mensagens_limite: 50,
        aviso: "Teste grátis — expira em 15 minutos OU 50 mensagens (o que vier primeiro). Não debita saldo.",
      });
    }

    if (action === "chaves" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const planCode = String(body?.plano ?? body?.plan_code ?? "").trim();
      const customerId = body?.id_cliente ? String(body.id_cliente) : null;
      const customerName = body?.nome ? String(body.nome).trim().slice(0, 120) : null;
      const customerEmail = body?.email ? String(body.email).trim().toLowerCase().slice(0, 200) : null;
      const customerWhatsapp = body?.whatsapp ? String(body.whatsapp).trim().slice(0, 40) : null;
      const requestId = req.headers.get("idempotency-key") || (body?.request_id ? String(body.request_id) : null);
      if (!PLAN_CODES.has(planCode)) return json({ success: false, error: "invalid_plano" }, 400);
      if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return json({ success: false, error: "email_obrigatorio", message: "O campo 'email' do cliente é obrigatório e deve ser válido. Sem ele o fornecedor não entrega a chave." }, 400);
      }

      // Idempotency
      if (requestId) {
        const { data: prior } = await svc
          .from("claude_orders")
          .select("id, plan_code, status, sale_price_cents, provider_key_id, code")
          .eq("reseller_id", reseller.id)
          .eq("request_id", requestId)
          .maybeSingle();
        if (prior) return json({ success: true, idempotent: true, pedido: prior });
      }

      const [{ data: defaultPrice }, { data: override }] = await Promise.all([
        svc.from("claude_plan_prices").select("*").eq("plan_code", planCode).maybeSingle(),
        svc.from("claude_reseller_price_overrides").select("*").eq("reseller_id", reseller.id).eq("plan_code", planCode).maybeSingle(),
      ]);
      if (!defaultPrice || !defaultPrice.is_active) return json({ success: false, error: "plano_indisponivel" }, 400);

      const costCents = defaultPrice.cost_cents;
      const resellerCostCents = await resolveResellerClaudeCost(
        svc,
        reseller.id,
        planCode,
        (defaultPrice as any).reseller_cost_cents ?? defaultPrice.sale_price_cents,
      );
      const saleCents = override && override.is_active
        ? computeSale(costCents, override.markup_mode, override.markup_value_cents)
        : defaultPrice.sale_price_cents;
      const profitCents = saleCents - resellerCostCents;

      // Pre-check: se sem saldo, cria pedido `awaiting_balance` que será
      // processado automaticamente após a próxima recarga do revendedor.
      const { data: balRow } = await svc.from("reseller_balances").select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
      const balance = balRow?.balance_cents ?? 0;
      if (balance < resellerCostCents) {
        const { data: waiting } = await svc.from("claude_orders").insert({
          reseller_id: reseller.id,
          plan_code: planCode,
          customer_identifier: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_whatsapp: customerWhatsapp,
          cost_cents: costCents,
          sale_price_cents: saleCents,
          profit_cents: profitCents,
          status: "awaiting_balance",
          request_id: requestId,
          error_message: "awaiting_balance: saldo insuficiente no momento da venda (API)",
        }).select().maybeSingle();
        return json({
          success: false,
          error: "saldo_insuficiente",
          status: "awaiting_balance",
          message: "Saldo insuficiente. O pedido ficou aguardando saldo e será liberado (chave gerada e webhook disparado) assim que você recarregar o painel com valor suficiente.",
          saldo_centavos: balance,
          preco_centavos: resellerCostCents,
          pedido_id: waiting?.id ?? null,
        }, 202);
      }

      const { data: order, error: oErr } = await svc.from("claude_orders").insert({
        reseller_id: reseller.id,
        plan_code: planCode,
        customer_identifier: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_whatsapp: customerWhatsapp,
        cost_cents: costCents,
        sale_price_cents: saleCents,
        profit_cents: profitCents,
        status: "pending",
        request_id: requestId,
      }).select().single();
      if (oErr) throw oErr;

      if (!CLAUDE_BASE_URL) {
        await svc.from("claude_orders").update({ status: "failed", error_message: "provider_not_configured" }).eq("id", order.id);
        return json({ success: false, error: "provider_not_configured" }, 500);
      }

      let providerResp: any = null;
      let providerStatus = 0;
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
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
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        await svc.from("claude_orders").update({ status: "failed", error_message: `network: ${(e as Error).message}` }).eq("id", order.id);
        return json({ success: false, error: "provider_network_error" }, 502);
      }

      if (providerStatus < 200 || providerStatus >= 300) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `provider_${providerStatus}`,
        }).eq("id", order.id);
        return json({ success: false, error: "provider_error", status: providerStatus, body: providerResp }, 502);
      }

      const code: string | undefined =
        providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
      const providerKeyId: string | undefined =
        providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
      const providerApiKey: string | undefined =
        providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
      const providerUserId: string | undefined =
        providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

      // SECURITY: atomic debit via RPC to prevent TOCTOU / double-spend.
      const { data: debited, error: debitErr } = await svc.rpc("debit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: resellerCostCents,
        _kind: "claude_key_issue",
        _description: `Emissão chave Claude ${planCode} (API)`,
        _reference_id: order.id,
      });
      if (debitErr || debited !== true) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `debit_failed: ${debitErr?.message ?? 'insufficient_balance'}`,
        }).eq("id", order.id);
        return json({ success: false, error: debitErr ? "debit_failed" : "saldo_insuficiente" }, 402);
      }

      await svc.from("claude_orders").update({
        status: "issued",
        code,
        provider_key_id: providerKeyId,
        provider_api_key: providerApiKey ?? null,
        provider_user_id: providerUserId ?? null,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
      }).eq("id", order.id);

      // Dispara webhook (best-effort — não bloqueia a resposta)
      dispatchWebhook(svc, reseller.id, "claude.key.issued", {
        pedido_id: order.id,
        plano: planCode,
        preco_centavos: saleCents,
        codigo: code,
        api_key: providerApiKey ?? null,
        base_url: providerApiKey ? "https://claude-ss.shardweb.app/" : null,
        provider_key_id: providerKeyId,
        id_cliente: customerId,
      }).catch((e) => console.warn("[reseller-claude-api] webhook issued dispatch failed", e));

      // Notifica gerente via Telegram
      try {
        const { data: rInfo } = await svc.from("resellers").select("display_name").eq("id", reseller.id).maybeSingle();
        const planLabel = PLAN_LABELS[planCode] ?? planCode;
        const txt =
          `🤖 <b>Venda Claude (API)</b>\n` +
          `👨‍💼 Revendedor: ${(rInfo as any)?.display_name ?? "—"}\n` +
          `📦 Plano: ${planLabel}\n` +
          (code ? `🔑 Chave: <code>${code}</code>\n` : "") +
          `👤 Cliente: ${customerName ?? "—"}` +
          (customerWhatsapp ? ` (${customerWhatsapp})` : "") +
          `\n💵 Valor: ${fmtBRL(saleCents)}\n` +
          `💳 Pagamento: Saldo da carteira (API)`;
        await svc.rpc("telegram_enqueue", { _text: txt });
      } catch (e) {
        console.warn("telegram_enqueue (claude api) failed", e);
      }

      // WhatsApp automático ao cliente final (best-effort)
      const waNumber = (customerWhatsapp ?? "").replace(/\D+/g, "");
      if (waNumber.length >= 10) {
        try {
          const { data: integ } = await svc
            .from("reseller_integrations")
            .select("evolution_enabled, evolution_send_on_api, connection_status")
            .eq("reseller_id", reseller.id)
            .maybeSingle();
          if (
            integ?.evolution_enabled &&
            (integ as any).evolution_send_on_api !== false &&
            integ?.connection_status === "connected"
          ) {
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-send-sale`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
              },
              body: JSON.stringify({
                reseller_id: reseller.id,
                kind: "claude",
                to: waNumber,
                vars: {
                  nome: customerName ?? "",
                  plano: PLAN_LABELS[planCode] ?? planCode,
                  codigo: code ?? "",
                  chave: code ?? "",
                  api_key: providerApiKey ?? "",
                  base_url: providerApiKey ? "https://claude-ss.shardweb.app/" : "",
                  valor_cents: String(saleCents ?? 0),
                },
              }),
            }).catch((e) => console.warn("evolution-send-sale (claude api) failed", e));
          }
        } catch (e) {
          console.warn("evolution-send-sale (claude api) lookup failed", e);
        }
      }

      return json({
        success: true,
        pedido_id: order.id,
        plano: planCode,
        preco_centavos: saleCents,
        codigo: code, // one-time
        provider_key_id: providerKeyId,
        // Entrega direta (só quando `email` foi enviado e o fornecedor retornou credenciais):
        api_key: providerApiKey ?? null,
        user_id: providerUserId ?? null,
        provider_base_url: providerApiKey ? "https://claude-ss.shardweb.app/" : null,
      });
    }

    return json({ success: false, error: "not_found" }, 404);
  } catch (e) {
    console.error("[reseller-claude-api]", e);
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});