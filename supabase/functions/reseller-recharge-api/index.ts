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
    const apiKey = req.headers.get("x-api-key") ?? req.headers.get("X-API-Key");
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

      // 1) Busca preço definido para este revendedor ou seu nível
      let precoCents = 0;
      
      // Tenta override individual primeiro
      const { data: overRow } = await admin
        .from("reseller_credit_prices")
        .select("price_cents")
        .eq("reseller_id", resellerId)
        .eq("credits_amount", creditos)
        .eq("is_active", true)
        .maybeSingle();
      
      if (overRow && overRow.price_cents > 0) {
        precoCents = overRow.price_cents;
      } else {
        // Fallback para o preço do nível (tier)
        const { data: tierRows } = await admin.rpc("get_reseller_tier", { _reseller_id: resellerId });
        const tier = Array.isArray(tierRows) ? tierRows[0] : tierRows;
        if (tier?.id) {
          const { data: tierPrice } = await admin
            .from("tier_credit_prices")
            .select("price_cents")
            .eq("tier_id", tier.id)
            .eq("is_active", true)
            .eq("plan_id", (await admin.from("credit_pricing_plans").select("id").eq("credits_amount", creditos).eq("is_active", true).maybeSingle()).data?.id)
            .maybeSingle();
          
          if (tierPrice && tierPrice.price_cents > 0) {
            precoCents = tierPrice.price_cents;
          }
        }
      }

      // Se não achou preço específico, usa o global do plano com desconto do nível
      if (precoCents <= 0) {
        const { data: planRow } = await admin
          .from("credit_pricing_plans")
          .select("price_cents, min_price_cents")
          .eq("credits_amount", creditos)
          .eq("is_active", true)
          .maybeSingle();
        
        if (!planRow || planRow.price_cents <= 0) {
          return errResp(400, "PRICE_NOT_SET", "Preço não definido para esta quantidade de créditos");
        }

        const { data: tierRows } = await admin.rpc("get_reseller_tier", { _reseller_id: resellerId });
        const tier = Array.isArray(tierRows) ? tierRows[0] : tierRows;
        const discount_pct = Number(tier?.discount_percent ?? 0);
        const min_price = Number(planRow.min_price_cents ?? 0);
        
        precoCents = Math.max(min_price, Math.round(planRow.price_cents * (1 - discount_pct / 100)));
      }

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
      const r = await callProvider(`/pedidos/${pid}/cancelar`, "POST", masterKey, rawBody);
      return json(r.data, r.status);
    }

    // ===== POST /pedidos/{id}/reembolso =====
    const refundMatch = path.match(/^\/pedidos\/([^/]+)\/reembolso$/);
    if (method === "POST" && refundMatch) {
      const pid = refundMatch[1];
      const r = await callProvider(`/pedidos/${pid}/reembolso`, "POST", masterKey, rawBody);
      // Se houve reembolso, credita de volta na plataforma
      if (r.data?.success && r.data?.data?.valorReembolsoCentavos) {
        // Verifica se o pedido pertence ao revendedor
        const { data: localOrder } = await admin
          .from("provider_credit_orders")
          .select("id, user_id")
          .eq("pedido_id", pid)
          .maybeSingle();
        if (localOrder && localOrder.user_id === userId) {
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

    return errResp(404, "NOT_FOUND", `Endpoint ${method} ${path} não encontrado`);
  } catch (e: any) {
    console.error("reseller-recharge-api error", e);
    return errResp(500, "INTERNAL_ERROR", e?.message ?? "Erro interno");
  }
});
