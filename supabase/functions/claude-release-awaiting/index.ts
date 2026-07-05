// Processa pedidos Claude com status `awaiting_balance` para um revendedor.
// Chamado por:
//  - misticpay-webhook (após cada recarga)
//  - admin manual (opcional)
//
// Estratégia: FIFO. Para cada pedido, tenta debitar (RPC atômica) e, em caso
// de sucesso, chama o provedor Claude para emitir a chave. Se o débito falhar
// (saldo insuficiente para o próximo), interrompe — sobra fica para a próxima
// recarga.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY") ?? "";
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (!data?.webhook_url) return;
  const body = JSON.stringify({ event, ...payload, sent_at: new Date().toISOString() });
  const sig = data.webhook_secret ? `sha256=${await hmacSha256Hex(data.webhook_secret, body)}` : "";
  try {
    await fetch(data.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LovConnect-Webhook/1.0",
        ...(sig ? { "X-Signature": sig } : {}),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (_) { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // Autenticação: apenas chamadas internas (service-role bearer) ou gerentes.
    const authTok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (authTok !== SERVICE_ROLE_KEY) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const userClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: `Bearer ${authTok}` } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "unauthorized" }, 401);
      const { data: isMgr } = await userClient.rpc("has_role", { _user_id: u.user.id, _role: "gerente" });
      if (!isMgr) return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const resellerId = String(body?.reseller_id ?? "").trim();
    if (!resellerId) return json({ error: "reseller_id required" }, 400);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: reseller } = await svc
      .from("resellers")
      .select("id, display_name, claude_enabled, is_active")
      .eq("id", resellerId)
      .maybeSingle();
    if (!reseller || !reseller.is_active || !reseller.claude_enabled) {
      return json({ ok: true, released: 0, skipped: "reseller_disabled" });
    }

    if (!CLAUDE_BASE_URL || !CLAUDE_API_KEY) {
      return json({ ok: false, error: "provider_not_configured" }, 500);
    }

    // Busca pedidos aguardando saldo, mais antigos primeiro
    const { data: awaiting } = await svc
      .from("claude_orders")
      .select("*")
      .eq("reseller_id", resellerId)
      .eq("status", "awaiting_balance")
      .order("created_at", { ascending: true })
      .limit(20);

    if (!awaiting || awaiting.length === 0) {
      return json({ ok: true, released: 0 });
    }

    // Custo do revendedor para o plano (mesmo cálculo usado ao emitir)
    const resolveCost = async (planCode: string, fallback: number) => {
      try {
        const { data } = await svc.rpc("get_reseller_claude_cost", {
          _reseller_id: resellerId,
          _plan_code: planCode,
        });
        if (typeof data === "number" && data > 0) return data;
      } catch { /* fallback */ }
      return fallback;
    };

    let released = 0;
    const releasedIds: string[] = [];

    for (const order of awaiting) {
      const { data: defaultPrice } = await svc
        .from("claude_plan_prices")
        .select("cost_cents, reseller_cost_cents, sale_price_cents, is_active")
        .eq("plan_code", order.plan_code)
        .maybeSingle();
      if (!defaultPrice || !defaultPrice.is_active) continue;
      const fallbackCost = (defaultPrice as any).reseller_cost_cents ?? defaultPrice.sale_price_cents;
      const resellerCost = await resolveCost(order.plan_code, fallbackCost);

      // Tenta debitar
      const { data: debited, error: debitErr } = await svc.rpc("debit_reseller_balance", {
        _reseller_id: resellerId,
        _amount_cents: resellerCost,
        _kind: "claude_key_issue",
        _description: `Liberação automática pedido Claude ${order.plan_code}`,
        _reference_id: order.id,
      });
      if (debitErr || debited !== true) {
        // Sem saldo para este — para o loop; próxima recarga tenta de novo.
        break;
      }

      // Chama provedor
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
            kind: order.plan_code,
            ...(order.customer_email ? { email: String(order.customer_email).toLowerCase() } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        });
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        // Estorna e mantém awaiting_balance para nova tentativa manual/futura
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: resellerCost,
          _kind: "claude_key_issue_refund",
          _description: `Estorno liberação pedido ${order.id} (network error)`,
          _reference_id: order.id,
        });
        break;
      }

      if (providerStatus < 200 || providerStatus >= 300) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: resellerCost,
          _kind: "claude_key_issue_refund",
          _description: `Estorno liberação pedido ${order.id} (provider ${providerStatus})`,
          _reference_id: order.id,
        });
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `provider_${providerStatus}`,
        }).eq("id", order.id);
        continue;
      }

      const code: string | undefined =
        providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
      const providerKeyId: string | undefined =
        providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
      const providerApiKey: string | undefined =
        providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
      const providerUserId: string | undefined =
        providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

      await svc.from("claude_orders").update({
        status: "issued",
        code,
        provider_key_id: providerKeyId,
        provider_api_key: providerApiKey ?? null,
        provider_user_id: providerUserId ?? null,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", order.id);

      released += 1;
      releasedIds.push(order.id);

      // Webhook (best-effort)
      dispatchWebhook(svc, resellerId, "claude.key.issued", {
        pedido_id: order.id,
        plano: order.plan_code,
        preco_centavos: order.sale_price_cents,
        codigo: code,
        provider_key_id: providerKeyId,
        id_cliente: order.customer_identifier,
        released_from_awaiting_balance: true,
      }).catch(() => {});
    }

    if (released > 0) {
      try {
        const amount = "R$ " + (Number(released) || 0).toString();
        await svc.rpc("telegram_enqueue", {
          _text:
            `🔓 <b>Vendas Claude liberadas</b>\n` +
            `👨‍💼 Revendedor: ${reseller.display_name ?? "—"}\n` +
            `📦 Pedidos liberados após recarga: ${released}`,
        });
      } catch { /* ignore */ }
    }

    return json({ ok: true, released, released_ids: releasedIds });
  } catch (e) {
    console.error("[claude-release-awaiting]", e);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});