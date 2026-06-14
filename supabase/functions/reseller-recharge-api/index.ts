import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const PROVIDER_BASE = "https://lojinhalovable.com/api/v1/revenda";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errResp = (status: number, code: string, error: string) =>
  json({ success: false, error, code }, status);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeApiKey(raw: string) {
  return raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/**
 * Enfileira um webhook de plano para a chave API que originou a assinatura.
 * Padrão de eventos:
 *   - plan.sold, plan.completed, plan.cancelled → enviados por padrão
 *   - plan.delivery.completed → opt-in (precisa estar em webhook_events)
 */
async function enqueuePlanWebhook(
  admin: any,
  sub: any,
  event: string,
  extra: Record<string, unknown> = {},
) {
  try {
    const apiKeyId = sub?.source === "api" ? sub?.source_reference_id : null;
    if (!apiKeyId) return;
    const { data: key } = await admin
      .from("reseller_api_keys")
      .select("id, webhook_url, webhook_events, is_active, revoked_at")
      .eq("id", apiKeyId)
      .maybeSingle();
    if (!key || key.revoked_at || !key.is_active || !key.webhook_url) return;

    const defaults = ["plan.sold", "plan.completed", "plan.cancelled"];
    const list: string[] | null = Array.isArray(key.webhook_events) ? key.webhook_events : null;
    if (list && list.length > 0) {
      if (!list.includes(event)) return;
    } else {
      if (!defaults.includes(event)) return;
    }

    const payload = {
      event,
      subscription_id: sub.id,
      reseller_id: sub.reseller_id,
      occurred_at: new Date().toISOString(),
      ...extra,
    };
    await admin.from("reseller_api_webhook_deliveries").insert({
      api_key_id: key.id,
      reseller_id: sub.reseller_id,
      event,
      target_url: key.webhook_url,
      payload,
    });
  } catch (e) {
    console.error("enqueuePlanWebhook failed", e);
  }
}

async function callProvider(
  path: string,
  method: string,
  apiKey: string,
  body?: string,
) {
  const r = await fetch(`${PROVIDER_BASE}${path}`, {
    method,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: body && method !== "GET" ? body : undefined,
  });
  const text = await r.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, error: "Provider non-JSON response", raw: text.slice(0, 300) };
  }
  return { status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---------- Auth: X-API-Key ----------
    const rawApiKey = req.headers.get("x-api-key") ?? req.headers.get("X-API-Key");
    const apiKey = rawApiKey ? normalizeApiKey(rawApiKey) : "";
    if (!apiKey) {
      return errResp(401, "MISSING_API_KEY", "Header X-API-Key não fornecido");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow } = await admin
      .from("reseller_api_keys")
      .select("id, reseller_id, is_active, scope")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!keyRow || !keyRow.is_active) {
      console.warn("[reseller-recharge-api] INVALID_API_KEY", {
        prefix: apiKey.slice(0, 12),
        length: apiKey.length,
      });
      return errResp(401, "INVALID_API_KEY", "API key inválida ou inexistente");
    }
    if (keyRow.scope && keyRow.scope !== "recharges") {
      return errResp(403, "WRONG_SCOPE", "Esta API key não é autorizada para recargas");
    }

    const resellerId: string = keyRow.reseller_id;

    // touch last_used_at (best effort)
    admin
      .from("reseller_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {});

    // user_id do revendedor (para gravar provider_credit_orders.user_id)
    const { data: reseller } = await admin
      .from("resellers")
      .select("user_id, is_active, activation_status")
      .eq("id", resellerId)
      .maybeSingle();

    if (!reseller || reseller.is_active === false) {
      return errResp(403, "ACCOUNT_DISABLED", "Conta de revendedor desativada");
    }
    if (reseller.activation_status && reseller.activation_status !== "active") {
      return errResp(403, "ACTIVATION_REQUIRED", "Painel pendente de ativação (R$ 200)");
    }
    const userId: string = reseller.user_id;

    // ---------- Master provider key ----------
    const { data: master } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "lovable_credits_master")
      .maybeSingle();
    const masterKey = (master?.value as any)?.api_key as string | undefined;
    if (!masterKey) {
      return errResp(503, "PROVIDER_NOT_CONFIGURED", "API do fornecedor não configurada na plataforma");
    }

    // ---------- Routing ----------
    const url = new URL(req.url);
    // Path after function name. Examples:
    //   /functions/v1/reseller-recharge-api/saldo
    //   /functions/v1/reseller-recharge-api/pedidos/UUID/tipo-entrega
    const fnIdx = url.pathname.indexOf("/reseller-recharge-api");
    let path = fnIdx >= 0 ? url.pathname.slice(fnIdx + "/reseller-recharge-api".length) : url.pathname;
    if (!path.startsWith("/")) path = "/" + path;
    if (path.endsWith("/")) path = path.slice(0, -1);

    const method = req.method.toUpperCase();
    const rawBody = ["POST", "PUT", "PATCH"].includes(method) ? await req.text() : "";

    // ===== GET /saldo =====
    if (method === "GET" && path === "/saldo") {
      const { data: bal } = await admin
        .from("reseller_balances")
        .select("balance_cents")
        .eq("reseller_id", resellerId)
        .maybeSingle();
      const cents = Number(bal?.balance_cents ?? 0);
      return json({
        success: true,
        data: {
          saldoCentavos: cents,
          saldoReais: (cents / 100).toFixed(2),
        },
      });
    }

    // ===== GET /orcamento?creditos=N =====
    if (method === "GET" && path === "/orcamento") {
      const creditos = url.searchParams.get("creditos");
      if (!creditos) return errResp(400, "MISSING_CREDITS", "Parâmetro creditos não fornecido");
      const { status, data } = await callProvider(
        `/orcamento?creditos=${encodeURIComponent(creditos)}`,
        "GET",
        masterKey,
      );
      // Enrich with reseller's platform balance check
      if (data?.success && data?.data) {
        const { data: bal } = await admin
          .from("reseller_balances")
          .select("balance_cents")
          .eq("reseller_id", resellerId)
          .maybeSingle();
        const saldo = Number(bal?.balance_cents ?? 0);
        const preco = Number(data.data.precoCentavos ?? 0);
        data.data.saldoAtualCentavos = saldo;
        data.data.saldoAtualReais = (saldo / 100).toFixed(2);
        data.data.saldoSuficiente = saldo >= preco;
      }
      return json(data, status);
    }

    // ===== POST /pedidos =====
    if (method === "POST" && path === "/pedidos") {
      let parsed: any = {};
      try { parsed = JSON.parse(rawBody || "{}"); } catch {}
      const creditos = Number(parsed?.creditos);
      if (!creditos || creditos < 10 || creditos > 5000 || creditos % 10 !== 0) {
        return errResp(400, "INVALID_CREDITS", "Quantidade inválida (10-5000, múltiplos de 10)");
      }

      // Fonte única de preço: regra do nível do revendedor (RPC oficial).
      const { data: planRow } = await admin
        .from("credit_pricing_plans")
        .select("id")
        .eq("credits_amount", creditos)
        .eq("is_active", true)
        .maybeSingle();
      if (!planRow?.id) {
        return errResp(400, "PRICE_NOT_SET", "Pacote de créditos não encontrado");
      }
      const { data: rpcCost } = await admin.rpc("get_credit_pack_cost", {
        _reseller_id: resellerId,
        _plan_id: planRow.id,
      });
      const basePrecoCents = Number(rpcCost ?? 0);
      if (basePrecoCents <= 0) {
        return errResp(400, "PRICE_NOT_SET", "Preço não definido para o seu nível neste pacote");
      }

      // Aplica promoção (créditos)
      let promoId: string | null = null;
      let promoDiscount = 0;
      let precoCents = basePrecoCents;
      try {
        const { data: pd } = await admin.rpc("compute_promotion_discount", {
          _base_cents: basePrecoCents,
          _kind: "credits",
        });
        const row: any = Array.isArray(pd) ? pd[0] : pd;
        if (row) {
          precoCents = Number(row.final_cents ?? basePrecoCents);
          promoDiscount = Number(row.discount_cents ?? 0);
          promoId = row.promotion_id ?? null;
        }
      } catch (_e) { /* preço cheio */ }

      // Pega preço atual no fornecedor (apenas para log/auditoria interna se necessário, mas o que vale é o precoCents acima)
      const quote = await callProvider(`/orcamento?creditos=${creditos}`, "GET", masterKey);
      if (!quote.data?.success) {
        return json(quote.data, quote.status);
      }
      // Opcional: validar se o precoCents cobre o custo do fornecedor (evitar prejuízo)
      // const custoFornecedor = Number(quote.data.data.precoCentavos);


      // Debita do saldo da plataforma
      const { data: debited, error: debitErr } = await admin.rpc("debit_reseller_balance", {
        _reseller_id: resellerId,
        _amount_cents: precoCents,
        _kind: "credit_recharge_api",
        _description: `Recarga ${creditos} créditos via API`,
        _reference_id: null,
      });
      if (debitErr) {
        return errResp(500, "DEBIT_FAILED", debitErr.message);
      }
      if (debited === false) {
        return errResp(400, "INSUFFICIENT_BALANCE", "Saldo insuficiente para esta operação");
      }

      // Cria no fornecedor
      const created = await callProvider("/pedidos", "POST", masterKey, rawBody);
      if (!created.data?.success) {
        // Reverte
        await admin.rpc("credit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: precoCents,
          _kind: "credit_recharge_refund",
          _description: `Estorno recarga (falha no fornecedor)`,
          _reference_id: null,
        });
        return json(created.data, created.status);
      }

      // Persiste local
      const d = created.data.data;
      const pedidoId = d.pedidoId ?? d.id;
      try {
        await admin.from("provider_credit_orders").insert({
          user_id: userId,
          pedido_id: pedidoId,
          creditos,
          preco_cents: precoCents,
          status: d.status ?? "aguardando",
          provider_response: d,
        });
      } catch (e) {
        console.error("persist provider_credit_order failed", e);
      }

      // Também registra em reseller_credit_purchases para aparecer nas telas
      // de acompanhamento/estornos do gerente e revendedor.
      try {
        await admin.from("reseller_credit_purchases").insert({
          reseller_id: resellerId,
          api_key_id: keyRow?.id ?? null,
          credits: creditos,
          price_cents: precoCents,
          status: d.status ?? "aguardando",
          tipo_entrega: "workspace_proprio",
          provider_pedido_id: pedidoId,
          provider_response: d,
          promotion_id: promoId,
          promotion_discount_cents: promoDiscount,
        });
      } catch (e) {
        console.error("persist reseller_credit_purchase failed", e);
      }

      // Devolve saldo atualizado da plataforma
      const { data: bal } = await admin
        .from("reseller_balances")
        .select("balance_cents")
        .eq("reseller_id", resellerId)
        .maybeSingle();
      const novoSaldo = Number(bal?.balance_cents ?? 0);
      d.novoSaldoCentavos = novoSaldo;
      d.novoSaldoReais = (novoSaldo / 100).toFixed(2);

      return json(created.data, created.status);
    }

    // ===== POST /pedidos/{id}/cancelar — refund partial =====
    const cancelMatch = path.match(/^\/pedidos\/([^/]+)\/cancelar$/);
    if (method === "POST" && cancelMatch) {
      const pid = cancelMatch[1];
      // Confirma que o pedido pertence ao revendedor autenticado antes
      // de proxiar a chamada para o provedor com a master key.
      const { data: ownership } = await admin
        .from("provider_credit_orders")
        .select("id")
        .eq("pedido_id", pid)
        .eq("user_id", userId)
        .maybeSingle();
      if (!ownership) {
        return errResp(404, "NOT_FOUND", "Pedido não encontrado");
      }
      const r = await callProvider(`/pedidos/${pid}/cancelar`, "POST", masterKey, rawBody);
      return json(r.data, r.status);
    }

    // ===== POST /pedidos/{id}/reembolso =====
    const refundMatch = path.match(/^\/pedidos\/([^/]+)\/reembolso$/);
    if (method === "POST" && refundMatch) {
      const pid = refundMatch[1];
      // Mesma checagem de ownership ANTES de chamar o provedor.
      const { data: ownership } = await admin
        .from("provider_credit_orders")
        .select("id, user_id")
        .eq("pedido_id", pid)
        .eq("user_id", userId)
        .maybeSingle();
      if (!ownership) {
        return errResp(404, "NOT_FOUND", "Pedido não encontrado");
      }
      const r = await callProvider(`/pedidos/${pid}/reembolso`, "POST", masterKey, rawBody);
      // Se houve reembolso, credita de volta na plataforma
      if (r.data?.success && r.data?.data?.valorReembolsoCentavos) {
        await admin.rpc("credit_reseller_balance", {
            _reseller_id: resellerId,
            _amount_cents: Number(r.data.data.valorReembolsoCentavos),
            _kind: "credit_recharge_refund",
            _description: `Reembolso pedido ${pid}`,
            _reference_id: null,
          });
          // Saldo atualizado
          const { data: bal } = await admin
            .from("reseller_balances")
            .select("balance_cents")
            .eq("reseller_id", resellerId)
            .maybeSingle();
          const novoSaldo = Number(bal?.balance_cents ?? 0);
          r.data.data.novoSaldoCentavos = novoSaldo;
          r.data.data.novoSaldoReais = (novoSaldo / 100).toFixed(2);
      }
      return json(r.data, r.status);
    }

    // ===== GET /pedidos — lista APENAS pedidos do revendedor autenticado =====
    if (method === "GET" && path === "/pedidos") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const statusFilter = url.searchParams.get("status");

      let q = admin
        .from("provider_credit_orders")
        .select("pedido_id, creditos, preco_cents, status, email_convite_bot, workspace_id, workspace_name, creditos_enviados, etapa_processamento, created_at, updated_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) q = q.eq("status", statusFilter);

      const { data: rows, count, error } = await q;
      if (error) return errResp(500, "DB_ERROR", error.message);

      return json({
        success: true,
        data: {
          total: count ?? rows?.length ?? 0,
          limit,
          offset,
          pedidos: (rows ?? []).map((r) => ({
            pedidoId: r.pedido_id,
            creditos: r.creditos,
            precoCentavos: r.preco_cents,
            status: r.status,
            emailConviteBot: r.email_convite_bot,
            workspaceId: r.workspace_id,
            workspaceName: r.workspace_name,
            creditosEnviados: r.creditos_enviados,
            etapaProcessamento: r.etapa_processamento,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        },
      });
    }

    // ===== Generic proxy for the remaining /pedidos/* endpoints =====
    // Allowed: GET /pedidos/{id}, GET /pedidos/{id}/acoes, GET /pedidos/{id}/acoes/{aid},
    //          PUT /pedidos/{id}/tipo-entrega, PUT /pedidos/{id}/email-lovable,
    //          POST /pedidos/{id}/confirmar-convite
    if (path.startsWith("/pedidos/")) {
      // Verifica se o pedido pertence ao revendedor autenticado
      const pidMatch = path.match(/^\/pedidos\/([^/]+)/);
      const pid = pidMatch?.[1];
      if (pid) {
        const { data: ownerRow } = await admin
          .from("provider_credit_orders")
          .select("user_id")
          .eq("pedido_id", pid)
          .maybeSingle();
        if (!ownerRow || ownerRow.user_id !== userId) {
          return errResp(404, "ORDER_NOT_FOUND", "Pedido não encontrado");
        }
      }

      const qs = url.search ? url.search : "";
      const r = await callProvider(`${path}${qs}`, method, masterKey, rawBody);

      // Local sync on order details / tipo-entrega
      if (
        r.data?.success &&
        ["GET", "PUT"].includes(method) &&
        /^\/pedidos\/[^/]+(\/tipo-entrega|\/email-lovable)?$/.test(path)
      ) {
        try {
          const d = r.data.data;
          const pid = d?.pedidoId ?? d?.id;
          if (pid) {
            const updates: Record<string, unknown> = {};
            if (d.status) updates.status = d.status;
            if (d.emailConviteBot) updates.email_convite_bot = d.emailConviteBot;
            if (d.workspaceId) updates.workspace_id = d.workspaceId;
            if (d.workspaceName) updates.workspace_name = d.workspaceName;
            if (d.creditosEnviados != null) updates.creditos_enviados = d.creditosEnviados;
            if (d.etapaProcessamento != null) updates.etapa_processamento = d.etapaProcessamento;
            if (Object.keys(updates).length > 0) {
              await admin
                .from("provider_credit_orders")
                .update(updates)
                .eq("pedido_id", pid)
                .eq("user_id", userId);
            }
          }
        } catch (e) {
          console.error("sync update failed", e);
        }
      }

      return json(r.data, r.status);
    }

    // ====================================================================
    // ====================  PLANOS DE RECARGA  ===========================
    // ====================================================================
    // Catálogo: GET /planos/catalogo
    if (method === "GET" && path === "/planos/catalogo") {
      const { data: plans } = await admin
        .from("recharge_plans")
        .select(
          "id, name, description, duration_days, credits_per_day, total_credits_cap, delivery_hour, base_cost_cents, is_active, bot_owner_email",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const { data: prices } = await admin
        .from("reseller_recharge_plan_prices")
        .select("plan_id, sale_price_cents, is_active")
        .eq("reseller_id", resellerId);
      const byPlan = new Map<string, any>();
      (prices ?? []).forEach((p: any) => byPlan.set(p.plan_id, p));
      const out = (plans ?? []).map((p: any) => {
        const pr = byPlan.get(p.id);
        return {
          planoId: p.id,
          nome: p.name,
          descricao: p.description,
          duracaoDias: p.duration_days,
          creditosPorDia: p.credits_per_day,
          capTotal: p.total_credits_cap,
          horarioEntregaBRT: p.delivery_hour,
          custoCentavos: Number(p.base_cost_cents),
          precoVendaCentavos: pr?.sale_price_cents ?? null,
          disponivel: !!pr?.is_active && pr?.sale_price_cents > 0,
        };
      });
      return json({ success: true, data: { planos: out } });
    }

    // POST /planos — cria uma assinatura e debita o custo do saldo da plataforma
    if (method === "POST" && path === "/planos") {
      let parsed: any = {};
      try { parsed = JSON.parse(rawBody || "{}"); } catch {}
      const planoId = parsed?.planoId ? String(parsed.planoId) : "";
      const nome = typeof parsed?.cliente?.nome === "string"
        ? parsed.cliente.nome.trim().slice(0, 120)
        : typeof parsed?.nome === "string" ? parsed.nome.trim().slice(0, 120) : "";
      const whatsapp = typeof parsed?.cliente?.whatsapp === "string"
        ? parsed.cliente.whatsapp.trim().slice(0, 32)
        : typeof parsed?.whatsapp === "string" ? parsed.whatsapp.trim().slice(0, 32) : "";
      const notes = typeof parsed?.notas === "string"
        ? parsed.notas.trim().slice(0, 500)
        : null;

      if (!planoId) return errResp(400, "MISSING_PLAN", "Campo planoId é obrigatório");
      if (nome.length < 2) return errResp(400, "INVALID_NAME", "Informe o nome do cliente");

      // Carrega plano + preço do revendedor
      const { data: plan } = await admin
        .from("recharge_plans")
        .select("*")
        .eq("id", planoId)
        .maybeSingle();
      if (!plan) return errResp(404, "PLAN_NOT_FOUND", "Plano não encontrado");
      if (!plan.is_active) return errResp(400, "PLAN_INACTIVE", "Plano está desativado");
      if (!plan.bot_owner_email) return errResp(503, "PLAN_NOT_READY", "Plano ainda não tem email do bot configurado");

      const { data: price } = await admin
        .from("reseller_recharge_plan_prices")
        .select("sale_price_cents, is_active")
        .eq("reseller_id", resellerId)
        .eq("plan_id", planoId)
        .maybeSingle();
      if (!price) return errResp(400, "SALE_PRICE_MISSING", "Defina seu preço de venda antes de gerar pedidos");
      if (!price.is_active) return errResp(400, "PLAN_DISABLED", "Você desativou este plano na sua loja");
      if (!price.sale_price_cents || price.sale_price_cents <= 0) {
        return errResp(400, "SALE_PRICE_MISSING", "Defina seu preço de venda antes de gerar pedidos");
      }

      const costCents = Number(plan.base_cost_cents);
      // Debita do saldo da plataforma
      const { data: debited, error: debitErr } = await admin.rpc("debit_reseller_balance", {
        _reseller_id: resellerId,
        _amount_cents: costCents,
        _kind: "recharge_plan_api",
        _description: `Venda do plano "${plan.name}" via API`,
        _reference_id: null,
      });
      if (debitErr) return errResp(500, "DEBIT_FAILED", debitErr.message);
      if (debited === false) {
        return errResp(400, "INSUFFICIENT_BALANCE", "Saldo insuficiente para esta operação");
      }

      // Cria a assinatura
      const { data: sub, error: insErr } = await admin
        .from("reseller_recharge_plan_subscriptions")
        .insert({
          reseller_id: resellerId,
          plan_id: plan.id,
          customer_name: nome,
          customer_whatsapp: whatsapp || null,
          owner_email_required: plan.bot_owner_email,
          source: "api",
          source_reference_id: keyRow?.id ?? null,
          cost_cents: costCents,
          sale_price_cents: Number(price.sale_price_cents),
          duration_days: plan.duration_days,
          credits_per_day: plan.credits_per_day,
          total_credits_cap: plan.total_credits_cap,
          delivery_hour: plan.delivery_hour,
          notes,
        })
        .select("id, order_token, status")
        .single();

      if (insErr || !sub) {
        // Reverte débito
        await admin.rpc("credit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: costCents,
          _kind: "recharge_plan_refund",
          _description: `Estorno (falha ao criar assinatura)`,
          _reference_id: null,
        });
        return errResp(500, "CREATE_FAILED", insErr?.message ?? "Falha ao criar assinatura");
      }

      const origin = `${url.protocol}//${url.host}`;
      // origin do edge não é o app; devolve a URL pública conhecida via header opcional
      const appOrigin = req.headers.get("x-app-origin") || "";
      const clientLink = `${appOrigin || origin}/plano/${sub.order_token}`;

      const { data: bal } = await admin
        .from("reseller_balances")
        .select("balance_cents")
        .eq("reseller_id", resellerId)
        .maybeSingle();

      // Dispara webhook plan.sold (best-effort)
      await enqueuePlanWebhook(
        admin,
        {
          id: sub.id,
          reseller_id: resellerId,
          source: "api",
          source_reference_id: keyRow?.id ?? null,
        },
        "plan.sold",
        {
          plan_id: plan.id,
          plan_name: plan.name,
          customer: { name: nome, whatsapp: whatsapp || null },
          duration_days: plan.duration_days,
          credits_per_day: plan.credits_per_day,
          total_credits: plan.total_credits_cap,
          cost_cents: costCents,
          sale_price_cents: Number(price.sale_price_cents),
          order_token: sub.order_token,
        },
      );

      return json({
        success: true,
        data: {
          assinaturaId: sub.id,
          token: sub.order_token,
          status: sub.status,
          linkCliente: clientLink,
          custoCentavos: costCents,
          precoVendaCentavos: Number(price.sale_price_cents),
          novoSaldoCentavos: Number(bal?.balance_cents ?? 0),
          novoSaldoReais: ((Number(bal?.balance_cents ?? 0)) / 100).toFixed(2),
        },
      });
    }

    // GET /planos — lista assinaturas do revendedor
    if (method === "GET" && path === "/planos") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const statusFilter = url.searchParams.get("status");

      let q = admin
        .from("reseller_recharge_plan_subscriptions")
        .select("id, order_token, status, customer_name, customer_whatsapp, workspace_name, started_at, ends_at, cost_cents, sale_price_cents, duration_days, credits_per_day, created_at", { count: "exact" })
        .eq("reseller_id", resellerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) q = q.eq("status", statusFilter as any);

      const { data: rows, count, error } = await q;
      if (error) return errResp(500, "DB_ERROR", error.message);

      return json({
        success: true,
        data: {
          total: count ?? rows?.length ?? 0,
          limit,
          offset,
          planos: (rows ?? []).map((r: any) => ({
            assinaturaId: r.id,
            token: r.order_token,
            status: r.status,
            cliente: { nome: r.customer_name, whatsapp: r.customer_whatsapp },
            workspaceName: r.workspace_name,
            inicio: r.started_at,
            fim: r.ends_at,
            custoCentavos: r.cost_cents,
            precoVendaCentavos: r.sale_price_cents,
            duracaoDias: r.duration_days,
            creditosPorDia: r.credits_per_day,
            createdAt: r.created_at,
          })),
        },
      });
    }

    // GET /planos/{token} — detalhes
    const planTokenMatch = path.match(/^\/planos\/([a-f0-9]{32})$/i);
    if (method === "GET" && planTokenMatch) {
      const tk = planTokenMatch[1];
      const { data: sub } = await admin
        .from("reseller_recharge_plan_subscriptions")
        .select("*")
        .eq("order_token", tk)
        .eq("reseller_id", resellerId)
        .maybeSingle();
      if (!sub) return errResp(404, "NOT_FOUND", "Assinatura não encontrada");
      const { data: deliveries } = await admin
        .from("recharge_plan_deliveries")
        .select("day_number, scheduled_date, credits, status, delivered_at")
        .eq("subscription_id", sub.id)
        .order("day_number", { ascending: true });
      return json({
        success: true,
        data: {
          assinaturaId: sub.id,
          token: sub.order_token,
          status: sub.status,
          cliente: { nome: sub.customer_name, whatsapp: sub.customer_whatsapp },
          workspaceName: sub.workspace_name,
          emailBotOwner: sub.owner_email_required,
          inicio: sub.started_at,
          fim: sub.ends_at,
          duracaoDias: sub.duration_days,
          creditosPorDia: sub.credits_per_day,
          custoCentavos: sub.cost_cents,
          precoVendaCentavos: sub.sale_price_cents,
          entregas: (deliveries ?? []).map((d: any) => ({
            dia: d.day_number,
            dataAgendada: d.scheduled_date,
            creditos: d.credits,
            status: d.status,
            entregueEm: d.delivered_at,
          })),
        },
      });
    }

    // POST /planos/{token}/cancelar — só antes do cliente confirmar início
    const planCancelMatch = path.match(/^\/planos\/([a-f0-9]{32})\/cancelar$/i);
    if (method === "POST" && planCancelMatch) {
      const tk = planCancelMatch[1];
      const { data: sub } = await admin
        .from("reseller_recharge_plan_subscriptions")
        .select("id, status, cost_cents")
        .eq("order_token", tk)
        .eq("reseller_id", resellerId)
        .maybeSingle();
      if (!sub) return errResp(404, "NOT_FOUND", "Assinatura não encontrada");
      if (sub.status !== "awaiting_owner" && sub.status !== "awaiting_confirm") {
        return errResp(400, "NOT_CANCELLABLE", "Não é mais possível cancelar — cliente já confirmou o início");
      }
      const { error: updErr } = await admin
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_reason: "Cancelado pelo revendedor via API",
        })
        .eq("id", sub.id);
      if (updErr) return errResp(500, "DB_ERROR", updErr.message);

      // Estorna o débito
      await admin.rpc("credit_reseller_balance", {
        _reseller_id: resellerId,
        _amount_cents: Number(sub.cost_cents),
        _kind: "recharge_plan_refund",
        _description: `Cancelamento de plano via API`,
        _reference_id: null,
      });
      return json({ success: true, data: { cancelado: true } });
    }

    return errResp(404, "NOT_FOUND", `Endpoint ${method} ${path} não encontrado`);
  } catch (e: any) {
    console.error("reseller-recharge-api error", e);
    return errResp(500, "INTERNAL_ERROR", e?.message ?? "Erro interno");
  }
});
