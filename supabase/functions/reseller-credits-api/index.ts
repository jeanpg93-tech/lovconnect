// Reseller Credits API — public endpoints for resellers to buy Lovable Credits.
// Authenticated via header `X-API-Key: lov_live_...`
// Headers opcionais:
//   Idempotency-Key: <string até 128 chars> (POSTs) — retries seguros em até 24h
// Rate limit: por chave (default 60 req/min). Headers de resposta:
//   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
// Endpoints (path after /reseller-credits-api):
//   GET   /status                          -> Saúde da API
//   GET   /saldo, /pacotes, /orcamento, /pedidos, /pedidos/{id}
//   POST  /pedidos                         -> Cria pedido automático
//   GET   /transacoes, /estatisticas, /uso
//   --- Webhooks ---
//   GET   /webhooks                        -> Config + eventos
//   GET   /webhooks/entregas               -> Histórico de entregas
//   POST  /webhooks/test                   -> Dispara webhook de teste
//   --- Manual ---
//   GET   /manual/info, GET/POST /pedidos-manual, POST /pedidos-manual/{id}/convite

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers":
    "x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after, idempotent-replay",
};

const PROVIDER_BASE = "https://lojinhalovable.com/api/v1/revenda";

function json(d: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toReais(cents: number) {
  return (cents / 100).toFixed(2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // strip "reseller-credits-api"
  const idx = segments.findIndex((s) => s === "reseller-credits-api");
  const route = idx >= 0 ? segments.slice(idx + 1) : segments;
  const action = route[0] || "";
  const subId = route[1] || "";

  // ---- Authentication ----
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey || apiKey.length < 10) return json({ success: false, error: "Missing X-API-Key" }, 401);

  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await svc
    .from("reseller_api_keys")
    .select("id, reseller_id, is_active, revoked_at, scope, rate_limit_per_minute, webhook_url, webhook_secret, webhook_events")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
    return json({ success: false, error: "API Key inválida ou revogada" }, 401);
  }

  const { data: reseller } = await svc
    .from("resellers")
    .select("id, is_active, activation_status")
    .eq("id", keyRow.reseller_id)
    .maybeSingle();
  if (!reseller || !reseller.is_active) {
    return json({ success: false, error: "Revendedor inativo" }, 403);
  }
  if (reseller.activation_status && reseller.activation_status !== "active") {
    return json({ success: false, error: "activation_required", message: "Painel pendente de ativação (R$ 200)" }, 403);
  }

  // ---- Scope enforcement ----
  // "recharges"        -> só endpoints AUTOMÁTICOS
  // "recharges_manual" -> só endpoints MANUAIS
  const isManualRoute =
    action === "pedidos-manual" ||
    (action === "manual" && subId === "info");
  const keyScope = (keyRow.scope ?? "").toString();
  if (isManualRoute && keyScope !== "recharges_manual") {
    return json(
      { success: false, error: "Esta API Key não tem permissão para o fluxo MANUAL. Gere uma chave do tipo 'API Manual'." },
      403
    );
  }
  if (!isManualRoute && keyScope === "recharges_manual") {
    return json(
      { success: false, error: "Esta API Key é do fluxo MANUAL e não pode acessar endpoints automáticos. Use sua chave 'API Automática'." },
      403
    );
  }

  // ---- Helpers ----
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null;
  const logUsage = async (status_code: number, opts: { cost_cents?: number; error?: string } = {}) => {
    await svc.from("reseller_api_usage").insert({
      api_key_id: keyRow.id,
      reseller_id: reseller.id,
      endpoint: `credits/${action}${subId ? "/" + subId : ""}`,
      method: req.method,
      status_code,
      cost_cents: opts.cost_cents ?? 0,
      error_message: opts.error ?? null,
      ip_address: ip,
    });
    await svc.from("reseller_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  };

  const getTierId = async (): Promise<string | null> => {
    const { data: tier } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
    return (tier as any)?.id ?? null;
  };

  const findPackagePrice = async (credits: number) => {
    const { data: plan } = await svc
      .from("credit_pricing_plans")
      .select("id, credits_amount, label, is_active")
      .eq("credits_amount", credits)
      .eq("is_active", true)
      .maybeSingle();
    if (!plan) return null;
    // Usa a RPC oficial: override individual > tier > Partner→Ouro > preço base
    const { data: cost } = await svc.rpc("get_credit_pack_cost", {
      _reseller_id: reseller.id,
      _plan_id: plan.id,
    });
    const price_cents = Number(cost ?? 0);
    if (price_cents <= 0) return null;
    const tierId = await getTierId();
    return { plan, tierId, price_cents };
  };

  const getProviderApiKey = async (): Promise<string | null> => {
    const { data } = await svc
      .from("app_settings")
      .select("value")
      .eq("key", "lovable_credits_master")
      .maybeSingle();
    return (data?.value as any)?.api_key ?? null;
  };

  // ============================================================
  // Rate limit (sliding window de 60s baseado em reseller_api_usage)
  // ============================================================
  const rateLimit = Math.max(1, Number(keyRow.rate_limit_per_minute ?? 60));
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count: usedInWindow } = await svc
    .from("reseller_api_usage")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", keyRow.id)
    .gte("created_at", windowStart);
  const used = Number(usedInWindow ?? 0);
  const remaining = Math.max(0, rateLimit - used);
  const resetSec = 60;
  const rlHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(rateLimit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining - 1)),
    "X-RateLimit-Reset": String(resetSec),
  };
  if (used >= rateLimit) {
    await logUsage(429, { error: "rate limit exceeded" });
    return json(
      {
        success: false,
        error: `Rate limit excedido (${rateLimit} req/min). Aguarde alguns segundos.`,
        rateLimit: { limit: rateLimit, remaining: 0, resetSeconds: resetSec },
      },
      429,
      { ...rlHeaders, "Retry-After": String(resetSec) }
    );
  }

  // ============================================================
  // Idempotência (apenas POST; TTL 24h)
  // ============================================================
  const idempotencyKey = (req.headers.get("idempotency-key") ?? "").trim();
  let cachedRequestBody: string | null = null;
  if (req.method === "POST" && idempotencyKey) {
    if (idempotencyKey.length > 128) {
      return json({ success: false, error: "Idempotency-Key muito longo (máx 128)" }, 400, rlHeaders);
    }
    // Le o body uma vez e congela para comparar hash + reusar abaixo
    cachedRequestBody = await req.text();
    const reqHash = await sha256Hex(cachedRequestBody);
    const { data: cached } = await svc
      .from("reseller_api_idempotency")
      .select("response_status, response_body, request_hash, expires_at")
      .eq("api_key_id", keyRow.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      if (cached.request_hash !== reqHash) {
        return json(
          { success: false, error: "Idempotency-Key já usada com payload diferente" },
          409,
          rlHeaders
        );
      }
      await logUsage(cached.response_status);
      return json(cached.response_body, cached.response_status, {
        ...rlHeaders,
        "Idempotent-Replay": "true",
      });
    }
  }

  // Wrapper que persiste a resposta para futuras tentativas com mesma Idempotency-Key
  const respond = async (body: unknown, status = 200, extra: Record<string, string> = {}) => {
    if (req.method === "POST" && idempotencyKey && status < 500) {
      const reqHash = await sha256Hex(cachedRequestBody ?? "");
      await svc.from("reseller_api_idempotency").upsert(
        {
          api_key_id: keyRow.id,
          reseller_id: reseller.id,
          idempotency_key: idempotencyKey,
          endpoint: `credits/${action}${subId ? "/" + subId : ""}`,
          request_hash: reqHash,
          response_status: status,
          response_body: body as any,
        },
        { onConflict: "api_key_id,idempotency_key" }
      );
    }
    return json(body, status, { ...rlHeaders, ...extra });
  };

  // Helper para parsear body respeitando idempotency cache
  const readJsonBody = async (): Promise<any> => {
    const raw = cachedRequestBody ?? (await req.text());
    cachedRequestBody = raw;
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  };

  if (req.method === "GET" && action === "saldo") {
    const { data: bal } = await svc
      .from("reseller_balances")
      .select("balance_cents")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    const cents = Number(bal?.balance_cents ?? 0);
    await logUsage(200);
    return json({
      success: true,
      data: { saldoCentavos: cents, saldoReais: toReais(cents) },
    });
  }

  // ============================================================
  // GET /pacotes
  // ============================================================
  if (req.method === "GET" && action === "pacotes") {
    const tierId = await getTierId();
    if (!tierId) {
      await logUsage(500, { error: "Tier não encontrado" });
      return json({ success: false, error: "Nivel do revendedor nao definido" }, 500);
    }
    const { data: plans } = await svc
      .from("credit_pricing_plans")
      .select("id, credits_amount, label")
      .eq("is_active", true)
      .order("credits_amount");
    const { data: prices } = await svc
      .from("tier_credit_prices")
      .select("plan_id, price_cents")
      .eq("tier_id", tierId);
    const map = new Map((prices ?? []).map((p) => [p.plan_id, Number(p.price_cents)]));
    const data = (plans ?? []).map((p) => {
      const price = map.get(p.id) ?? 0;
      return {
        creditos: p.credits_amount,
        label: p.label,
        precoCentavos: price,
        precoReais: toReais(price),
      };
    });
    await logUsage(200);
    return json({ success: true, data });
  }

  // ============================================================
  // GET /orcamento?creditos=NN
  // ============================================================
  if (req.method === "GET" && action === "orcamento") {
    const credits = parseInt(url.searchParams.get("creditos") ?? "0", 10);
    if (!credits || credits <= 0) {
      await logUsage(400, { error: "creditos inválido" });
      return json({ success: false, error: "Parametro 'creditos' invalido" }, 400);
    }
    const pkg = await findPackagePrice(credits);
    if (!pkg) {
      await logUsage(404, { error: "pacote não encontrado" });
      return json({ success: false, error: "Pacote nao disponivel para essa quantidade" }, 404);
    }
    const { data: bal } = await svc
      .from("reseller_balances")
      .select("balance_cents")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    const saldo = Number(bal?.balance_cents ?? 0);
    await logUsage(200);
    return json({
      success: true,
      data: {
        creditos: credits,
        precoCentavos: pkg.price_cents,
        precoReais: toReais(pkg.price_cents),
        saldoAtualCentavos: saldo,
        saldoAtualReais: toReais(saldo),
        saldoSuficiente: saldo >= pkg.price_cents,
        precoUnitarioCentavos: +(pkg.price_cents / credits).toFixed(2),
      },
    });
  }

  // ============================================================
  // POST /pedidos  -> cria pedido
  //   body: { creditos, tipo_entrega: "workspace_proprio" | "workspace_novo",
  //           workspace_id?, email_conta_lovable? }
  // ============================================================
  if (req.method === "POST" && action === "pedidos" && !subId) {
    const body = await readJsonBody();
    const credits = parseInt(body?.creditos ?? "0", 10);
    const tipo_entrega = (body?.tipo_entrega ?? "").toString();
    const workspace_id = body?.workspace_id?.toString() ?? null;
    const email_conta = body?.email_conta_lovable?.toString() ?? null;

    if (!credits || credits <= 0) {
      await logUsage(400, { error: "creditos invalido" });
      return respond({ success: false, error: "Campo 'creditos' obrigatorio" }, 400);
    }
    if (!["workspace_proprio", "workspace_novo"].includes(tipo_entrega)) {
      await logUsage(400, { error: "tipo_entrega invalido" });
      return respond(
        { success: false, error: "tipo_entrega deve ser 'workspace_proprio' ou 'workspace_novo'" },
        400
      );
    }
    if (tipo_entrega === "workspace_proprio" && !workspace_id) {
      await logUsage(400, { error: "workspace_id obrigatorio" });
      return respond({ success: false, error: "workspace_id obrigatorio para workspace_proprio" }, 400);
    }
    if (tipo_entrega === "workspace_novo" && !email_conta) {
      await logUsage(400, { error: "email_conta_lovable obrigatorio" });
      return respond({ success: false, error: "email_conta_lovable obrigatorio para workspace_novo" }, 400);
    }

    const pkg = await findPackagePrice(credits);
    if (!pkg) {
      await logUsage(404, { error: "pacote nao disponivel" });
      return respond({ success: false, error: "Pacote nao disponivel para essa quantidade" }, 404);
    }

    // Aplica promoção (créditos) — desconto sobre o preço do pacote
    let promoId: string | null = null;
    let promoDiscount = 0;
    let finalCost = pkg.price_cents;
    try {
      const { data: pd } = await svc.rpc("compute_promotion_discount", {
        _base_cents: pkg.price_cents,
        _kind: "credits",
      });
      const row: any = Array.isArray(pd) ? pd[0] : pd;
      if (row) {
        finalCost = Number(row.final_cents ?? pkg.price_cents);
        promoDiscount = Number(row.discount_cents ?? 0);
        promoId = row.promotion_id ?? null;
      }
    } catch (_e) { /* fallback ao preço cheio */ }

    // Debita saldo
    const { data: ok } = await svc.rpc("debit_reseller_balance", {
      _reseller_id: reseller.id,
      _amount_cents: finalCost,
      _kind: "credit_purchase_api",
      _description: `Compra ${credits} créditos via API`,
      _reference_id: null,
    });
    if (ok !== true) {
      await logUsage(402, { error: "saldo insuficiente" });
      return respond({ success: false, error: "Saldo insuficiente" }, 402);
    }

    // Encaminha ao provedor PRIMEIRO para obter o pedidoId real
    const providerKey = await getProviderApiKey();
    if (!providerKey) {
      // refund
      await svc.rpc("credit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: finalCost,
        _kind: "credit_purchase_api_refund",
        _description: "Estorno: provedor nao configurado",
        _reference_id: null,
      });
      await logUsage(503, { error: "provider not configured" });
      return json({ success: false, error: "Provedor temporariamente indisponivel" }, 503, rlHeaders);
    }

    let providerData: any = null;
    let providerStatus = 0;
    let costCents: number | null = null;
    try {
      const providerBody: any = { creditos: credits, tipo_entrega };
      if (workspace_id) providerBody.workspace_id = workspace_id;
      if (email_conta) providerBody.email_conta_lovable = email_conta;
      const r = await fetch(`${PROVIDER_BASE}/pedidos`, {
        method: "POST",
        headers: { "X-API-Key": providerKey, "Content-Type": "application/json" },
        body: JSON.stringify(providerBody),
      });
      providerStatus = r.status;
      providerData = await r.json().catch(() => null);
      costCents = providerData?.data?.precoCentavos ?? null;
    } catch (e) {
      providerData = { error: (e as Error).message };
    }

    if (providerStatus < 200 || providerStatus >= 300) {
      await svc.rpc("credit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: finalCost,
        _kind: "credit_purchase_api_refund",
        _description: `Estorno: erro provedor`,
        _reference_id: null,
      });
      await logUsage(502, { error: "provider error" });
      return json(
        {
          success: false,
          error: providerData?.error ?? "Erro ao processar com o provedor (estorno realizado)",
        },
        502,
        rlHeaders
      );
    }

    const providerPedidoId = providerData?.data?.pedidoId ?? providerData?.data?.id ?? null;

    const insertPayload: any = {
      reseller_id: reseller.id,
      api_key_id: keyRow.id,
      credits,
      price_cents: finalCost,
      status: providerData?.data?.status ?? "processando",
      tipo_entrega,
      email_conta_lovable: email_conta,
      workspace_id,
      provider_pedido_id: providerPedidoId,
      provider_response: providerData,
      cost_cents: costCents,
      promotion_id: promoId,
      promotion_discount_cents: promoDiscount,
    };
    if (providerPedidoId) insertPayload.id = providerPedidoId;

    const { data: purchase, error: insErr } = await svc
      .from("reseller_credit_purchases")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insErr || !purchase) {
      await logUsage(200, { warning: "insert local falhou", insErr: insErr?.message, provider_pedido_id: providerPedidoId });
      return respond({
        success: true,
        data: {
          pedidoId: providerPedidoId,
          providerPedidoId,
          creditos: credits,
          precoCentavos: pkg.price_cents,
          precoReais: toReais(pkg.price_cents),
          status: providerData?.data?.status ?? "processando",
          tipo_entrega,
          warning: "Pedido criado no provedor, mas falha ao registrar localmente",
        },
      });
    }

    await logUsage(200, { cost_cents: finalCost });
    return respond({
      success: true,
      data: {
        pedidoId: purchase.id,
        providerPedidoId,
        creditos: credits,
        precoCentavos: finalCost,
        precoReais: toReais(finalCost),
        precoOriginalCentavos: pkg.price_cents,
        descontoCentavos: promoDiscount,
        promotionId: promoId,
        status: providerData?.data?.status ?? "processando",
        tipo_entrega,
      },
    });
  }

  // ============================================================
  // GET /pedidos        -> lista
  // GET /pedidos/{id}   -> detalhe
  // ============================================================
  if (req.method === "GET" && action === "pedidos") {
    if (subId) {
      const { data: p } = await svc
        .from("reseller_credit_purchases")
        .select("*")
        .eq("id", subId)
        .eq("reseller_id", reseller.id)
        .maybeSingle();
      if (!p) {
        await logUsage(404);
        return json({ success: false, error: "Pedido nao encontrado" }, 404);
      }
      await logUsage(200);
      return json({
        success: true,
        data: {
          id: p.id,
          creditos: p.credits,
          precoCentavos: p.price_cents,
          precoReais: toReais(p.price_cents),
          status: p.status,
          tipo_entrega: p.tipo_entrega,
          workspace_id: p.workspace_id,
          email_conta_lovable: p.email_conta_lovable,
          error_message: p.error_message,
          created_at: p.created_at,
          updated_at: p.updated_at,
        },
      });
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count } = await svc
      .from("reseller_credit_purchases")
      .select("id, credits, price_cents, status, tipo_entrega, created_at", {
        count: "exact",
      })
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    await logUsage(200);
    return json({
      success: true,
      data: (data ?? []).map((p) => ({
        id: p.id,
        creditos: p.credits,
        precoCentavos: p.price_cents,
        precoReais: toReais(p.price_cents),
        status: p.status,
        tipo_entrega: p.tipo_entrega,
        created_at: p.created_at,
      })),
      pagination: { page, limit, total: count ?? 0 },
    });
  }

  // ============================================================
  // GET /status -> Saúde da API e aviso de manutenção
  // ============================================================
  if (req.method === "GET" && action === "status") {
    const { data: alertRow } = await svc
      .from("app_settings")
      .select("value")
      .eq("key", "recharge_provider_alert")
      .maybeSingle();
    const alert = (alertRow?.value as any) ?? {};
    const { data: providerCfg } = await svc
      .from("app_settings")
      .select("value")
      .eq("key", "lovable_credits_master")
      .maybeSingle();
    const providerConfigured = !!(providerCfg?.value as any)?.api_key;
    await logUsage(200);
    return json({
      success: true,
      data: {
        operacional: providerConfigured && !alert?.enabled,
        manutencao: !!alert?.enabled,
        mensagem: alert?.enabled ? (alert?.message ?? null) : null,
        etaMinutos: alert?.enabled ? (alert?.eta_minutes ?? null) : null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // ============================================================
  // GET /transacoes?page=&limit=&tipo=
  // ============================================================
  if (req.method === "GET" && action === "transacoes") {
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10)));
    const tipo = url.searchParams.get("tipo");
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let q = svc
      .from("balance_transactions")
      .select("id, amount_cents, kind, description, created_at", { count: "exact" })
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (tipo === "entrada") q = q.gt("amount_cents", 0);
    if (tipo === "saida") q = q.lt("amount_cents", 0);
    const { data, count } = await q;
    await logUsage(200);
    return json({
      success: true,
      data: (data ?? []).map((t) => ({
        id: t.id,
        tipo: t.amount_cents >= 0 ? "entrada" : "saida",
        valorCentavos: t.amount_cents,
        valorReais: toReais(Math.abs(t.amount_cents)),
        categoria: t.kind,
        descricao: t.description,
        data: t.created_at,
      })),
      pagination: { page, limit, total: count ?? 0 },
    });
  }

  // ============================================================
  // GET /estatisticas?periodo=7d|30d|90d|all
  // ============================================================
  if (req.method === "GET" && action === "estatisticas") {
    const periodo = url.searchParams.get("periodo") ?? "30d";
    const map: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = map[periodo] ?? 0;
    const since = days > 0 ? new Date(Date.now() - days * 86400_000).toISOString() : null;

    let q = svc
      .from("reseller_credit_purchases")
      .select("credits, price_cents, status, created_at")
      .eq("reseller_id", reseller.id);
    if (since) q = q.gte("created_at", since);
    const { data: purchases } = await q;

    const list = purchases ?? [];
    const byStatus: Record<string, number> = {};
    let totalCreditos = 0;
    let totalGastoCentavos = 0;
    for (const p of list) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      if (p.status !== "cancelado" && p.status !== "estornado") {
        totalCreditos += Number(p.credits ?? 0);
        totalGastoCentavos += Number(p.price_cents ?? 0);
      }
    }

    const { data: bal } = await svc
      .from("reseller_balances")
      .select("balance_cents")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    await logUsage(200);
    return json({
      success: true,
      data: {
        periodo,
        totalPedidos: list.length,
        pedidosPorStatus: byStatus,
        totalCreditos,
        totalGastoCentavos,
        totalGastoReais: toReais(totalGastoCentavos),
        ticketMedioCentavos: list.length ? Math.round(totalGastoCentavos / list.length) : 0,
        saldoAtualCentavos: Number(bal?.balance_cents ?? 0),
        saldoAtualReais: toReais(Number(bal?.balance_cents ?? 0)),
      },
    });
  }

  // ============================================================
  // GET /uso -> uso da API key nos últimos 30 dias
  // ============================================================
  if (req.method === "GET" && action === "uso") {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: usage } = await svc
      .from("reseller_api_usage")
      .select("endpoint, status_code, created_at")
      .eq("api_key_id", keyRow.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    const list = usage ?? [];
    const byEndpoint: Record<string, number> = {};
    let sucesso = 0;
    let erro = 0;
    for (const u of list) {
      byEndpoint[u.endpoint] = (byEndpoint[u.endpoint] ?? 0) + 1;
      if (u.status_code >= 200 && u.status_code < 400) sucesso++;
      else erro++;
    }

    await logUsage(200);
    return json({
      success: true,
      data: {
        periodoDias: 30,
        totalChamadas: list.length,
        sucesso,
        erro,
        taxaSucesso: list.length ? +((sucesso / list.length) * 100).toFixed(2) : 100,
        chamadasPorEndpoint: byEndpoint,
        ultimoUso: list[0]?.created_at ?? null,
      },
    });
  }

  // ============================================================
  // Fluxo MANUAL
  // ============================================================
  const MANUAL_BOT_EMAIL = "recarga@revendovable.store";
  const MANUAL_SLA_HOURS = 24;

  // GET /manual/info
  if (req.method === "GET" && action === "manual" && subId === "info") {
    await logUsage(200);
    return json({
      success: true,
      data: {
        emailBot: MANUAL_BOT_EMAIL,
        slaHoras: MANUAL_SLA_HOURS,
        instrucoes: [
          "Crie o pedido em POST /pedidos-manual informando creditos e tipo_entrega.",
          `Convide ${MANUAL_BOT_EMAIL} como editor do workspace Lovable de destino.`,
          "Confirme o convite chamando POST /pedidos-manual/{id}/convite com workspace_name.",
          "Acompanhe o status em GET /pedidos-manual/{id} até virar 'entregue'.",
        ],
      },
    });
  }

  // POST /pedidos-manual
  if (req.method === "POST" && action === "pedidos-manual" && !subId) {
    const body = await readJsonBody();
    const credits = parseInt(body?.creditos ?? "0", 10);
    const tipo_entrega = (body?.tipo_entrega ?? "").toString();
    const workspace_name = body?.workspace_name?.toString()?.trim() || null;
    const email_conta = body?.email_conta_lovable?.toString() || null;

    if (!credits || credits <= 0) {
      await logUsage(400, { error: "creditos invalido" });
      return respond({ success: false, error: "Campo 'creditos' obrigatorio" }, 400);
    }
    if (!["workspace_proprio", "workspace_novo"].includes(tipo_entrega)) {
      await logUsage(400, { error: "tipo_entrega invalido" });
      return respond(
        { success: false, error: "tipo_entrega deve ser 'workspace_proprio' ou 'workspace_novo'" },
        400
      );
    }

    const pkg = await findPackagePrice(credits);
    if (!pkg) {
      await logUsage(404, { error: "pacote nao disponivel" });
      return respond({ success: false, error: "Pacote nao disponivel para essa quantidade" }, 404);
    }

    const { data: ok } = await svc.rpc("debit_reseller_balance", {
      _reseller_id: reseller.id,
      _amount_cents: pkg.price_cents,
      _kind: "credit_purchase_api_manual",
      _description: `Compra MANUAL ${credits} créditos via API`,
      _reference_id: null,
    });
    if (ok !== true) {
      await logUsage(402, { error: "saldo insuficiente" });
      return respond({ success: false, error: "Saldo insuficiente" }, 402);
    }

    const localPedidoId = crypto.randomUUID();
    const { data: purchase, error: insErr } = await svc
      .from("reseller_credit_purchases")
      .insert({
        id: localPedidoId,
        reseller_id: reseller.id,
        api_key_id: keyRow.id,
        credits,
        price_cents: pkg.price_cents,
        status: "manual_pendente",
        tipo_entrega,
        email_conta_lovable: email_conta,
        provider_pedido_id: localPedidoId,
        provider_response: { manual: true, mode: "manual" },
        cost_cents: pkg.price_cents,
      })
      .select("*")
      .single();

    if (insErr || !purchase) {
      await svc.rpc("credit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: pkg.price_cents,
        _kind: "credit_purchase_api_manual_refund",
        _description: "Estorno: falha ao criar pedido manual",
        _reference_id: null,
      });
      await logUsage(500, { error: insErr?.message ?? "insert failed" });
      return json({ success: false, error: "Falha ao criar pedido manual (estorno realizado)" }, 500, rlHeaders);
    }

    await svc.from("manual_recharge_metadata").upsert(
      {
        reseller_id: reseller.id,
        provider_pedido_id: localPedidoId,
        workspace_name,
        invite_status: "pending",
      },
      { onConflict: "provider_pedido_id" }
    );

    await logUsage(200, { cost_cents: pkg.price_cents });
    return respond({
      success: true,
      data: {
        pedidoId: localPedidoId,
        creditos: credits,
        precoCentavos: pkg.price_cents,
        precoReais: toReais(pkg.price_cents),
        status: "manual_pendente",
        tipo_entrega,
        workspace_name,
        emailBot: MANUAL_BOT_EMAIL,
        slaHoras: MANUAL_SLA_HOURS,
        proximoPasso: `Convide ${MANUAL_BOT_EMAIL} como editor e confirme em POST /pedidos-manual/${localPedidoId}/convite`,
      },
    });
  }

  // POST /pedidos-manual/{id}/convite  -> marca convite enviado
  if (req.method === "POST" && action === "pedidos-manual" && subId && route[2] === "convite") {
    const body = await readJsonBody();
    const workspace_name = body?.workspace_name?.toString()?.trim() || null;
    const invite_status_raw = (body?.invite_status ?? "sent").toString();
    const invite_status = ["pending", "sent", "confirmed"].includes(invite_status_raw)
      ? invite_status_raw
      : "sent";

    const { data: p } = await svc
      .from("reseller_credit_purchases")
      .select("id, reseller_id, provider_pedido_id")
      .eq("id", subId)
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    if (!p) {
      await logUsage(404);
      return respond({ success: false, error: "Pedido manual nao encontrado" }, 404);
    }

    const { error: upErr } = await svc.from("manual_recharge_metadata").upsert(
      {
        reseller_id: reseller.id,
        provider_pedido_id: p.provider_pedido_id ?? p.id,
        workspace_name,
        invite_status,
      },
      { onConflict: "provider_pedido_id" }
    );
    if (upErr) {
      await logUsage(500, { error: upErr.message });
      return json({ success: false, error: "Falha ao registrar convite" }, 500, rlHeaders);
    }

    await logUsage(200);
    return respond({
      success: true,
      data: {
        pedidoId: p.id,
        workspace_name,
        invite_status,
        emailBot: MANUAL_BOT_EMAIL,
      },
    });
  }

  // GET /pedidos-manual or /pedidos-manual/{id}
  if (req.method === "GET" && action === "pedidos-manual") {
    if (subId) {
      const { data: p } = await svc
        .from("reseller_credit_purchases")
        .select("*")
        .eq("id", subId)
        .eq("reseller_id", reseller.id)
        .maybeSingle();
      if (!p) {
        await logUsage(404);
        return json({ success: false, error: "Pedido manual nao encontrado" }, 404);
      }
      const { data: meta } = await svc
        .from("manual_recharge_metadata")
        .select("workspace_name, invite_status, notes, updated_at")
        .eq("provider_pedido_id", p.provider_pedido_id ?? p.id)
        .maybeSingle();
      await logUsage(200);
      return json({
        success: true,
        data: {
          id: p.id,
          creditos: p.credits,
          precoCentavos: p.price_cents,
          precoReais: toReais(p.price_cents),
          status: p.status,
          tipo_entrega: p.tipo_entrega,
          workspace_id: p.workspace_id,
          email_conta_lovable: p.email_conta_lovable,
          workspace_name: meta?.workspace_name ?? null,
          invite_status: meta?.invite_status ?? "pending",
          notas_equipe: meta?.notes ?? null,
          error_message: p.error_message,
          created_at: p.created_at,
          updated_at: p.updated_at,
          emailBot: MANUAL_BOT_EMAIL,
        },
      });
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count } = await svc
      .from("reseller_credit_purchases")
      .select("id, credits, price_cents, status, tipo_entrega, created_at, provider_pedido_id", {
        count: "exact",
      })
      .eq("reseller_id", reseller.id)
      .like("status", "manual%")
      .order("created_at", { ascending: false })
      .range(from, to);

    const ids = (data ?? []).map((r) => r.provider_pedido_id ?? r.id);
    const { data: metas } = ids.length
      ? await svc
          .from("manual_recharge_metadata")
          .select("provider_pedido_id, workspace_name, invite_status")
          .in("provider_pedido_id", ids)
      : { data: [] as any[] };
    const metaMap = new Map((metas ?? []).map((m) => [m.provider_pedido_id, m]));

    await logUsage(200);
    return json({
      success: true,
      data: (data ?? []).map((p) => {
        const m = metaMap.get(p.provider_pedido_id ?? p.id) as any;
        return {
          id: p.id,
          creditos: p.credits,
          precoCentavos: p.price_cents,
          precoReais: toReais(p.price_cents),
          status: p.status,
          tipo_entrega: p.tipo_entrega,
          workspace_name: m?.workspace_name ?? null,
          invite_status: m?.invite_status ?? "pending",
          created_at: p.created_at,
        };
      }),
      pagination: { page, limit, total: count ?? 0 },
    });
  }

  // ============================================================
  // GET /webhooks -> info da configuração de webhooks da chave atual
  // ============================================================
  if (req.method === "GET" && action === "webhooks" && !subId) {
    await logUsage(200);
    return json({
      success: true,
      data: {
        webhookUrl: keyRow.webhook_url ?? null,
        webhookConfigured: !!keyRow.webhook_url,
        webhookSecretSet: !!keyRow.webhook_secret,
        eventos: keyRow.webhook_events ?? [],
        eventosDisponiveis: [
          "order.completed", "order.failed", "order.refunded",
          "manual.confirmed", "manual.delivered",
        ],
        rateLimit: { porMinuto: rateLimit, restantes: Math.max(0, remaining - 1) },
        instrucoes: [
          "Cada entrega vem com header X-Webhook-Signature: hex(HMAC-SHA256(corpo, webhook_secret)).",
          "Valide o header e retorne HTTP 2xx em até 10s. Demoras = retry.",
          "Idempotência: salve o id da entrega (header X-Webhook-Delivery) e ignore duplicatas.",
        ],
      },
    }, 200, rlHeaders);
  }

  // GET /webhooks/entregas?limit=&status=
  if (req.method === "GET" && action === "webhooks" && subId === "entregas") {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const filterStatus = url.searchParams.get("status"); // delivered | pending | failed
    let q = svc
      .from("reseller_api_webhook_deliveries")
      .select("id, event, target_url, attempt, response_status, delivered_at, created_at")
      .eq("api_key_id", keyRow.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filterStatus === "delivered") q = q.not("delivered_at", "is", null);
    if (filterStatus === "pending") q = q.is("delivered_at", null);
    if (filterStatus === "failed") q = q.is("delivered_at", null).gte("attempt", 3);
    const { data: deliveries } = await q;
    await logUsage(200);
    return json({
      success: true,
      data: (deliveries ?? []).map((d) => ({
        id: d.id,
        evento: d.event,
        url: d.target_url,
        tentativa: d.attempt,
        statusResposta: d.response_status,
        entregueEm: d.delivered_at,
        criadoEm: d.created_at,
        entregue: !!d.delivered_at,
      })),
    }, 200, rlHeaders);
  }

  // POST /webhooks/test -> enfileira um webhook de teste imediato
  if (req.method === "POST" && action === "webhooks" && subId === "test") {
    if (!keyRow.webhook_url) {
      return respond({ success: false, error: "Esta API Key não tem webhook_url configurada" }, 400);
    }
    const payload = {
      event: "webhook.test",
      message: "Webhook de teste disparado pela API",
      apiKeyId: keyRow.id,
      timestamp: new Date().toISOString(),
    };
    const { data: delivery, error } = await svc
      .from("reseller_api_webhook_deliveries")
      .insert({
        reseller_id: reseller.id,
        api_key_id: keyRow.id,
        event: "webhook.test",
        payload,
        target_url: keyRow.webhook_url,
      })
      .select("id")
      .single();
    if (error || !delivery) {
      return respond({ success: false, error: "Falha ao enfileirar webhook de teste" }, 500);
    }
    await logUsage(200);
    return respond({
      success: true,
      data: {
        deliveryId: delivery.id,
        message: "Webhook de teste enfileirado. Será enviado em até 1 minuto.",
      },
    });
  }

  await logUsage(404, { error: "rota não encontrada" });
  return json({ success: false, error: "Rota nao encontrada" }, 404, rlHeaders);
});
