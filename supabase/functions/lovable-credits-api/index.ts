import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reseller-id",
  "Access-Control-Allow-Methods": "POST, GET, PUT, OPTIONS",
};

const EXTERNAL_API_BASE = "https://lojinhalovable.com/api/v1/revenda";

const normalizeCreditStatus = (status: unknown) => {
  const original = String(status ?? "").trim();
  const s = original.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (["finalizado", "finalizada", "concluido", "concluida", "sucesso", "success", "succeeded", "completed", "complete", "done"].includes(s)) return "completed";
  if (["aguardando", "processando", "pending", "processing", "configurando", "em_processamento"].includes(s)) return "configurando";
  if (["cancelado", "canceled", "cancelled"].includes(s)) return "cancelado";
  if (["falha", "falhou", "failed", "erro", "error"].includes(s)) return "failed";
  if (["reembolsado", "refunded"].includes(s)) return "reembolsado";
  return original || "configurando";
};

const getProviderOrderIdFromLocalOrder = (order: any) => {
  const resp = order?.provider_response;
  return resp?.data?.pedidoId
    ?? resp?.data?.id
    ?? resp?.pedidoId
    ?? resp?.id
    ?? order?.notes?.match(/ID Provedor: ([\w-]+)/)?.[1]
    ?? null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: authError } = await supabaseClient.auth.getClaims(token);

    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string | undefined };

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const method = req.method;

    // ===== Admin actions: chave mestre global em app_settings =====
    if (action === "admin-get-settings" || action === "admin-save-settings" || action === "admin-delete-settings") {
      const { data: roleRow } = await adminClient
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "gerente").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "admin-get-settings") {
        const { data } = await adminClient
          .from("app_settings").select("value, updated_at")
          .eq("key", "lovable_credits_master").maybeSingle();
        const key = data?.value?.api_key as string | undefined;
        return new Response(JSON.stringify({
          configured: !!key,
          api_key_masked: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null,
          updated_at: data?.updated_at ?? null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "admin-save-settings") {
        const body = await req.json().catch(() => ({}));
        const newKey = (body?.api_key ?? "").toString().trim();
        if (!newKey) {
          return new Response(JSON.stringify({ error: "api_key required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await adminClient.from("app_settings").upsert({
          key: "lovable_credits_master",
          value: { api_key: newKey },
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "admin-delete-settings") {
        await adminClient.from("app_settings").delete().eq("key", "lovable_credits_master");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== Aviso de lentidão do provedor =====
    if (action === "admin-get-alert" || action === "admin-save-alert") {
      const { data: roleRow } = await adminClient
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "gerente").maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "admin-get-alert") {
        const { data } = await adminClient
          .from("app_settings").select("value, updated_at")
          .eq("key", "lovable_credits_alert").maybeSingle();
        return new Response(JSON.stringify({
          enabled: !!data?.value?.enabled,
          message: data?.value?.message ?? "",
          eta_minutes: data?.value?.eta_minutes ?? null,
          updated_at: data?.updated_at ?? null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "admin-save-alert") {
        const body = await req.json().catch(() => ({}));
        const value = {
          enabled: !!body?.enabled,
          message: (body?.message ?? "").toString().slice(0, 500),
          eta_minutes: body?.eta_minutes != null ? Number(body.eta_minutes) : null,
        };
        await adminClient.from("app_settings").upsert({
          key: "lovable_credits_alert",
          value,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        });
        return new Response(JSON.stringify({ ok: true, ...value }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // SECURITY: x-reseller-id só é confiável quando o caller é gerente
    // (impersonação administrativa). Para qualquer outro usuário o
    // resellerId é sempre derivado do JWT, evitando IDOR/drenagem de saldo.
    const requestedResellerId = req.headers.get("x-reseller-id");
    let resellerId: string | null = null;
    const { data: isManagerRow } = await adminClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "gerente").maybeSingle();
    const isManager = !!isManagerRow;

    if (requestedResellerId && isManager) {
      resellerId = requestedResellerId;
    } else {
      const { data: reseller } = await adminClient
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      resellerId = reseller?.id ?? null;
    }

    if (resellerId) {
      const { data: r } = await adminClient
        .from("resellers").select("activation_status").eq("id", resellerId).maybeSingle();
      if (r && r.activation_status && r.activation_status !== "active") {
        return new Response(JSON.stringify({ error: "activation_required", message: "Painel pendente de ativação (R$ 200)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // API Key: SEMPRE usa a chave mestre do gerente (gerente → provedor).
    // O revendedor compra créditos via plataforma; quem fala com o provedor é o gerente.
    let apiKey: string | null = null;
    {
      const { data: master } = await adminClient
        .from("app_settings").select("value")
        .eq("key", "lovable_credits_master").maybeSingle();
      apiKey = (master?.value?.api_key as string | undefined) ?? null;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Lovable Credits API Key not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    let externalPath = "";
    let queryParams = new URLSearchParams();

    switch (action) {
      case "balance":
        externalPath = "/saldo";
        break;
      case "quote":
        const credits = url.searchParams.get("credits");
        externalPath = "/orcamento";
        queryParams.set("creditos", credits || "10");
        break;
      case "orders":
        externalPath = "/pedidos";
        const page = url.searchParams.get("page");
        const limit = url.searchParams.get("limit");
        const status = url.searchParams.get("status");
        if (page) queryParams.set("page", page);
        if (limit) queryParams.set("limit", limit);
        if (status) queryParams.set("status", status);
        break;
      case "create_order":
        externalPath = "/pedidos";
        break;
      case "reseller_create_order": {
        if (!resellerId) {
          return new Response(JSON.stringify({ error: "Revendedor não encontrado" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Bloqueia compra de créditos quando houver vendas da loja aguardando saldo
        {
          const { data: hasPending } = await adminClient.rpc("has_pending_storefront_orders", {
            _reseller_id: resellerId,
          });
          if (hasPending) {
            return new Response(JSON.stringify({
              error: "Você tem vendas da loja aguardando saldo. Regularize seu saldo antes de comprar créditos.",
              code: "PENDING_BALANCE",
            }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Bloqueia compras quando o gerente ativa o modo manutenção das recargas.
        {
          const { data: rsMaint } = await adminClient
            .from("app_settings")
            .select("value")
            .eq("key", "recargas_settings")
            .maybeSingle();
          const v: any = rsMaint?.value ?? {};
          if (v.maintenance_enabled === true) {
            return new Response(JSON.stringify({
              error: v.maintenance_message || "Recargas em manutenção. Tente novamente em breve.",
              code: "RECHARGE_MAINTENANCE",
            }), {
              status: 503,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        const body = await req.json().catch(() => ({}));
        const creditos = parseInt(body?.creditos ?? "0", 10);
        const tipoEntrega = (body?.tipo_entrega ?? "workspace_proprio").toString();
        let orderMode = (body?.mode ?? "automatico").toString() === "manual" ? "manual" : "automatico";
        // Enforcement: a configuração global "active_mode" sobrescreve o que vier do cliente.
        // Quando o gerente coloca a plataforma em modo manual, TODAS as entregas de créditos
        // passam pela fila manual, independente do que o frontend mandar.
        try {
          const { data: rs } = await adminClient
            .from("app_settings")
            .select("value")
            .eq("key", "recargas_settings")
            .maybeSingle();
          const globalMode = (rs?.value as any)?.active_mode;
          if (globalMode === "manual") orderMode = "manual";
        } catch (_e) { /* fallback to client mode if settings unreachable */ }
        const customerName = typeof body?.customer_name === "string"
          ? body.customer_name.trim().slice(0, 120)
          : "";
        const customerWhatsapp = typeof body?.customer_whatsapp === "string"
          ? body.customer_whatsapp.replace(/\D+/g, "").slice(0, 15)
          : "";

        if (!creditos || creditos <= 0) {
          return new Response(JSON.stringify({ error: "Campo 'creditos' obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: plan } = await adminClient
          .from("credit_pricing_plans")
          .select("id,credits_amount,label,is_active")
          .eq("credits_amount", creditos)
          .eq("is_active", true)
          .maybeSingle();
        if (!plan) {
          return new Response(JSON.stringify({ error: "Pacote de créditos não disponível" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fonte única: nível do revendedor -> preço daquele nível (RPC oficial).
        const { data: rpcCost } = await adminClient.rpc("get_credit_pack_cost", {
          _reseller_id: resellerId,
          _plan_id: plan.id,
        });
        const costCents = Number(rpcCost ?? 0);
        if (costCents <= 0) {
          return new Response(JSON.stringify({ error: "Preço de custo não definido para este nível" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Aplica promoção (créditos)
        let promoId: string | null = null;
        let promoDiscount = 0;
        let finalCost = costCents;
        try {
          const { data: pd } = await adminClient.rpc("compute_promotion_discount", {
            _base_cents: costCents,
            _kind: "credits",
          });
          const row: any = Array.isArray(pd) ? pd[0] : pd;
          if (row) {
            finalCost = Number(row.final_cents ?? costCents);
            promoDiscount = Number(row.discount_cents ?? 0);
            promoId = row.promotion_id ?? null;
          }
        } catch (_e) { /* preço cheio */ }

        const { data: debited, error: debitErr } = await adminClient.rpc("debit_reseller_balance", {
          _reseller_id: resellerId,
          _amount_cents: finalCost,
          _kind: "credit_purchase",
          _description: `Compra ${creditos} créditos`,
          _reference_id: null,
        });
        if (debitErr || debited !== true) {
          return new Response(JSON.stringify({ error: debitErr?.message ?? "Saldo insuficiente na plataforma" }), {
            status: debitErr ? 500 : 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Manual mode: skip external provider — create a local pedido and let the platform team process it.
        if (orderMode === "manual") {
          const localPedidoId = crypto.randomUUID();
          const manualPayload = {
            pedidoId: localPedidoId,
            status: "manual_pendente",
            creditos,
            precoCentavos: finalCost,
            mode: "manual",
          };
          await adminClient.from("reseller_credit_purchases").insert({
            reseller_id: resellerId,
            credits: creditos,
            price_cents: finalCost,
            status: "manual_pendente",
            tipo_entrega: tipoEntrega,
            provider_pedido_id: localPedidoId,
            provider_response: { manual: true, ...manualPayload },
            cost_cents: costCents,
            customer_name: customerName || null,
            customer_whatsapp: customerWhatsapp || null,
            promotion_id: promoId,
            promotion_discount_cents: promoDiscount,
          });
          await adminClient.from("orders").insert({
            reseller_id: resellerId,
            license_type: "credits",
            product_type: "credits",
            credit_amount: creditos,
            price_cents: finalCost,
            status: "pending",
            provider_response: manualPayload,
            notes: `Créditos: ${creditos}. Entrega: ${tipoEntrega}. Modo: manual. ID Local: ${localPedidoId}${customerName ? `. Cliente: ${customerName}` : ""}${customerWhatsapp ? ` (${customerWhatsapp})` : ""}`,
            promotion_id: promoId,
            promotion_discount_cents: promoDiscount,
          });
          return new Response(JSON.stringify({ success: true, data: { ...manualPayload, providerPedidoId: localPedidoId } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const providerResponse = await fetch(`${EXTERNAL_API_BASE}/pedidos`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ creditos, tipo_entrega: tipoEntrega }),
        });
        const providerText = await providerResponse.text();
        let providerData: any;
        try { providerData = JSON.parse(providerText); } catch { providerData = { raw: providerText }; }

        if (!providerResponse.ok || providerData?.success === false) {
          await adminClient.rpc("credit_reseller_balance", {
            _reseller_id: resellerId,
            _amount_cents: finalCost,
            _kind: "credit_purchase_refund",
            _description: `Estorno compra ${creditos} créditos`,
            _reference_id: null,
          });
          return new Response(JSON.stringify({ error: providerData?.error ?? "Erro ao processar com o provedor", details: providerData }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const providerPayload = providerData?.data ?? providerData;
        const providerPedidoId = providerPayload?.pedidoId ?? providerPayload?.id ?? null;
        await adminClient.from("reseller_credit_purchases").insert({
          reseller_id: resellerId,
          credits: creditos,
          price_cents: finalCost,
          status: providerPayload?.status ?? "processando",
          tipo_entrega: tipoEntrega,
          provider_pedido_id: providerPedidoId,
          provider_response: providerData,
          cost_cents: providerPayload?.precoCentavos ?? providerPayload?.valorCentavos ?? null,
          customer_name: customerName || null,
          customer_whatsapp: customerWhatsapp || null,
          promotion_id: promoId,
          promotion_discount_cents: promoDiscount,
        });
        await adminClient.from("orders").insert({
          reseller_id: resellerId,
          license_type: "credits",
          product_type: "credits",
          credit_amount: creditos,
          price_cents: finalCost,
          status: "completed",
          provider_response: providerPayload,
          notes: `Créditos: ${creditos}. Entrega: ${tipoEntrega}. ID Provedor: ${providerPedidoId}${customerName ? `. Cliente: ${customerName}` : ""}${customerWhatsapp ? ` (${customerWhatsapp})` : ""}`,
          promotion_id: promoId,
          promotion_discount_cents: promoDiscount,
        });

        return new Response(JSON.stringify({ success: true, data: { ...providerPayload, providerPedidoId, precoCentavos: finalCost, precoOriginalCentavos: costCents, descontoCentavos: promoDiscount, promotionId: promoId, creditos } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "define_delivery": {
        const delOrderId = url.searchParams.get("id");
        externalPath = `/pedidos/${delOrderId}/tipo-entrega`;
        break;
      }
      case "order_details": {
        const orderId = url.searchParams.get("id");
        externalPath = `/pedidos/${orderId}`;
        break;
      }
      case "confirm_invite": {
        const confirmOrderId = url.searchParams.get("id");
        externalPath = `/pedidos/${confirmOrderId}/confirmar-convite`;
        break;
      }
      case "action_status": {
        const aOrderId = url.searchParams.get("id");
        const acaoId = url.searchParams.get("acao_id");
        externalPath = `/pedidos/${aOrderId}/acoes/${acaoId}`;
        break;
      }
      case "my_orders": {
        // List local provider_credit_orders for this user
        const { data: myOrders, error: myOrdersErr } = await adminClient
          .from("provider_credit_orders")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        return new Response(JSON.stringify({ success: true, data: myOrders ?? [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "sync_my_pending": {
        // Refresh local status from provider for non-terminal orders of this user
        const { data: localProviderOrders } = await adminClient
          .from("provider_credit_orders")
          .select("pedido_id, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        const { data: resellerForSync } = await adminClient
          .from("resellers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        const { data: creditOrders } = resellerForSync?.id
          ? await adminClient
              .from("orders")
              .select("id, status, provider_response, notes")
              .eq("reseller_id", resellerForSync.id)
              .or("product_type.eq.credits,license_type.eq.credits")
              .order("created_at", { ascending: false })
              .limit(50)
          : { data: [] } as any;
        const idsToSync = new Set<string>();
        for (const p of localProviderOrders ?? []) if ((p as any).pedido_id) idsToSync.add((p as any).pedido_id);
        for (const order of creditOrders ?? []) {
          const providerId = getProviderOrderIdFromLocalOrder(order);
          if (providerId) idsToSync.add(providerId);
        }
        const toSync = Array.from(idsToSync);
        let updated = 0;
        for (const pedidoId of toSync) {
          try {
            const r = await fetch(`${EXTERNAL_API_BASE}/pedidos/${pedidoId}`, {
              headers: { "X-API-Key": apiKey },
            });
            if (!r.ok) { await r.text().catch(() => ""); continue; }
            const j = await r.json();
            const d = j?.data;
            if (!d) continue;
            const normalizedStatus = normalizeCreditStatus(d.status);
            const updates: Record<string, unknown> = {};
            if (d.status) updates.status = normalizedStatus;
            if (d.emailConviteBot) updates.email_convite_bot = d.emailConviteBot;
            if (d.workspaceId) updates.workspace_id = d.workspaceId;
            if (d.workspaceName) updates.workspace_name = d.workspaceName;
            if (d.creditosEnviados != null) updates.creditos_enviados = d.creditosEnviados;
            if (d.etapaProcessamento != null) updates.etapa_processamento = d.etapaProcessamento;
            updates.provider_response = d;
            if (Object.keys(updates).length > 0) {
              await adminClient
                .from("provider_credit_orders")
                .update(updates)
                .eq("pedido_id", pedidoId)
                .eq("user_id", user.id);
              if (resellerForSync?.id) {
                await adminClient
                  .from("orders")
                  .update({ status: normalizedStatus, provider_response: d })
                  .eq("reseller_id", resellerForSync.id)
                  .or("product_type.eq.credits,license_type.eq.credits")
                  .like("notes", `%ID Provedor: ${pedidoId}%`);
              }
              updated++;
            }
          } catch (e) {
            console.error("sync_my_pending failed for", pedidoId, e);
          }
        }
        return new Response(JSON.stringify({ success: true, synced: toSync.length, updated }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "refund_order": {
        const refundOrderId = url.searchParams.get("id");
        if (!refundOrderId) {
          return new Response(JSON.stringify({ success: false, error: "id required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!resellerId) {
          return new Response(JSON.stringify({ success: false, error: "Revendedor não encontrado" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 1) Carrega pedido + valida ownership
        const { data: localOrder } = await adminClient
          .from("provider_credit_orders")
          .select("id, status, pedido_id, preco_cents, creditos")
          .eq("pedido_id", refundOrderId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!localOrder) {
          return new Response(JSON.stringify({ success: false, error: "Pedido não encontrado" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 2) Dedupe forte: já existe transação de refund para este pedido?
        const { data: existingRefund } = await adminClient
          .from("balance_transactions")
          .select("id, amount_cents, created_at")
          .eq("reseller_id", resellerId)
          .eq("reference_id", localOrder.id)
          .in("kind", ["refund", "credit_purchase_refund"])
          .limit(1)
          .maybeSingle();
        if (existingRefund) {
          return new Response(JSON.stringify({
            success: false,
            error: "Este pedido já foi reembolsado anteriormente",
            already_refunded: true,
            refund: existingRefund,
          }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 3) Lock atômico: só prossegue se status==='cancelado' AGORA. Move para 'reembolsando'
        //    para bloquear concorrência (clique duplo, retries).
        const { data: locked, error: lockErr } = await adminClient
          .from("provider_credit_orders")
          .update({ status: "reembolsando", updated_at: new Date().toISOString() })
          .eq("pedido_id", refundOrderId)
          .eq("user_id", user.id)
          .eq("status", "cancelado")
          .select("id")
          .maybeSingle();
        if (lockErr || !locked) {
          // Status pode ter mudado: outra requisição em andamento, já reembolsado, ou não está cancelado.
          const currentStatus = String(localOrder.status ?? "").toLowerCase();
          const msg = currentStatus === "reembolsando"
            ? "Reembolso já está em processamento"
            : currentStatus === "reembolsado"
              ? "Pedido já foi reembolsado"
              : "Reembolso disponível apenas para pedidos cancelados";
          return new Response(JSON.stringify({ success: false, error: msg, status_atual: localOrder.status }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Helper para reverter o lock se algo falhar antes de creditar
        const revertLock = async () => {
          await adminClient
            .from("provider_credit_orders")
            .update({ status: "cancelado", updated_at: new Date().toISOString() })
            .eq("pedido_id", refundOrderId)
            .eq("user_id", user.id)
            .eq("status", "reembolsando");
        };

        // 4) Chama provedor
        let refundResp: Response;
        try {
          refundResp = await fetch(`${EXTERNAL_API_BASE}/pedidos/${refundOrderId}/reembolso`, {
            method: "POST",
            headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          });
        } catch (e) {
          await revertLock();
          return new Response(JSON.stringify({ success: false, error: `Falha de rede ao chamar provedor: ${(e as Error).message}` }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const refundText = await refundResp.text();
        let refundJson: any;
        try { refundJson = JSON.parse(refundText); } catch {
          await revertLock();
          return new Response(JSON.stringify({ success: false, error: `Provedor respondeu não-JSON (${refundResp.status})`, body: refundText.slice(0, 300) }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!refundResp.ok || !refundJson?.success) {
          await revertLock();
          return new Response(JSON.stringify({ success: false, error: refundJson?.error || refundJson?.message || "Falha ao solicitar reembolso", provider: refundJson }), {
            status: refundResp.status || 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 5) Valida valor: nunca pode exceder o que foi cobrado originalmente
        const d = refundJson.data ?? {};
        const providerRefundCents = Number(d.valorReembolsoCentavos ?? 0);
        const originalCents = Number(localOrder.preco_cents ?? 0);
        let valorReembolsoCents = providerRefundCents;
        let cappedReason: string | null = null;
        if (!Number.isFinite(valorReembolsoCents) || valorReembolsoCents < 0) {
          valorReembolsoCents = 0;
        }
        if (originalCents > 0 && valorReembolsoCents > originalCents) {
          cappedReason = `Valor do provedor (${providerRefundCents}) excedeu o original (${originalCents}); limitado.`;
          console.warn("REFUND CAPPED", { refundOrderId, providerRefundCents, originalCents });
          valorReembolsoCents = originalCents;
        }

        // 6) Credita saldo (com reference_id para dedupe futura) e finaliza status
        if (valorReembolsoCents > 0) {
          const { error: creditErr } = await adminClient.rpc("credit_reseller_balance", {
            _reseller_id: resellerId,
            _amount_cents: valorReembolsoCents,
            _kind: "refund",
            _description: `Reembolso pedido cancelado #${refundOrderId.slice(0, 8)} (${d.creditosNaoEnviados ?? localOrder.creditos ?? 0} créditos)`,
            _reference_id: localOrder.id,
          });
          if (creditErr) {
            console.error("credit_reseller_balance failed:", creditErr);
            await revertLock();
            return new Response(JSON.stringify({ success: false, error: "Falha ao creditar saldo; reembolso não aplicado", details: creditErr.message }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        await adminClient
          .from("provider_credit_orders")
          .update({
            status: "reembolsado",
            provider_response: {
              ...(d || {}),
              refunded_at: new Date().toISOString(),
              refunded_amount_cents: valorReembolsoCents,
              provider_amount_cents: providerRefundCents,
              capped_reason: cappedReason,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("pedido_id", refundOrderId)
          .eq("user_id", user.id);

        // Auditoria
        await adminClient.from("admin_audit_logs").insert({
          action: "credit_order_refund",
          user_id: user.id,
          details: {
            pedido_id: refundOrderId,
            local_order_id: localOrder.id,
            reseller_id: resellerId,
            credited_cents: valorReembolsoCents,
            provider_cents: providerRefundCents,
            original_cents: originalCents,
            capped: cappedReason,
          },
        }).then(() => {}, () => {});

        return new Response(JSON.stringify({
          ...refundJson,
          data: { ...d, creditadoCentavos: valorReembolsoCents, capped: !!cappedReason },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const fullUrl = `${EXTERNAL_API_BASE}${externalPath}${queryParams.toString() ? "?" + queryParams.toString() : ""}`;
    
    const requestInit: RequestInit = {
      method: method,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      requestInit.body = await req.text();
    }

    const response = await fetch(fullUrl, requestInit);
    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("Provider returned non-JSON:", response.status, rawText.slice(0, 500));
      return new Response(JSON.stringify({
        success: false,
        error: `Provedor respondeu com status ${response.status} (resposta não-JSON)`,
        provider_status: response.status,
        provider_body_preview: rawText.slice(0, 300),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist provider credit order locally when creating a new order
    if (action === "create_order" && response.ok && data?.success && (data?.data?.pedidoId || data?.data?.id)) {
      try {
        const d = data.data;
        const pedidoId = d.pedidoId ?? d.id;
        const creditos = d.creditos ?? d.creditosSolicitados ?? 100;
        const precoCents = d.precoCentavos ?? d.valorCentavos ?? null;
        const status = d.status ?? "aguardando";
        await adminClient.from("provider_credit_orders").insert({
          user_id: user.id,
          pedido_id: pedidoId,
          creditos,
          preco_cents: precoCents,
          status,
          provider_response: d,
        });
      } catch (persistErr) {
        console.error("Failed to persist provider_credit_order:", persistErr);
      }
    }

    // Update local row on order details or define_delivery when we have richer data
    if ((action === "order_details" || action === "define_delivery") && response.ok && data?.success && (data?.data?.pedidoId || data?.data?.id)) {
      try {
        const d = data.data;
        const pedidoId = d.pedidoId ?? d.id;
        const updates: Record<string, unknown> = {};
        if (d.status) updates.status = d.status;
        if (d.emailConviteBot) updates.email_convite_bot = d.emailConviteBot;
        if (d.workspaceId) updates.workspace_id = d.workspaceId;
        if (d.workspaceName) updates.workspace_name = d.workspaceName;
        if (d.creditosEnviados != null) updates.creditos_enviados = d.creditosEnviados;
        if (d.etapaProcessamento != null) updates.etapa_processamento = d.etapaProcessamento;
        if (Object.keys(updates).length > 0) {
          await adminClient
            .from("provider_credit_orders")
            .update(updates)
            .eq("pedido_id", pedidoId)
            .eq("user_id", user.id);
        }
      } catch (updErr) {
        console.error("Failed to update provider_credit_order:", updErr);
      }
    }

    // Enrich /pedidos list with the responsible user's email (admin/gerente view)
    if (action === "orders" && response.ok && data?.success) {
      try {
        const pedidos: any[] = data?.data?.pedidos ?? data?.pedidos ?? [];
        const ids = pedidos.map((p) => p.id ?? p.pedidoId).filter(Boolean);
        if (ids.length > 0) {
          const { data: localRows } = await adminClient
            .from("provider_credit_orders")
            .select("pedido_id, user_id")
            .in("pedido_id", ids);
          const userIds = Array.from(new Set((localRows ?? []).map((r) => r.user_id).filter(Boolean)));
          let emailById: Record<string, string> = {};
          if (userIds.length > 0) {
            const { data: profs } = await adminClient
              .from("profiles")
              .select("id, email, display_name")
              .in("id", userIds);
            for (const p of profs ?? []) {
              emailById[p.id as string] = (p as any).email ?? (p as any).display_name ?? "";
            }
          }
          const userByPedido: Record<string, string> = {};
          for (const r of localRows ?? []) {
            const uid = (r as any).user_id as string;
            userByPedido[(r as any).pedido_id as string] = emailById[uid] ?? "";
          }
          for (const p of pedidos) {
            const pid = p.id ?? p.pedidoId;
            p.responsavel_email = userByPedido[pid] ?? null;
          }
        }
      } catch (enrichErr) {
        console.error("Failed to enrich orders with responsible user:", enrichErr);
      }
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in lovable-credits-api:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
