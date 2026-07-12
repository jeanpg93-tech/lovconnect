import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const EXTERNAL_API_BASE = "https://lojinhalovable.com/api/v1/revenda";

async function getMasterKey() {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "lovable_credits_master")
    .maybeSingle();
  return (data?.value?.api_key as string | undefined) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const orderId = url.searchParams.get("id");

    // Aviso público de lentidão (não requer orderId)
    if (action === "alert") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const { data } = await admin
        .from("app_settings").select("value, updated_at")
        .eq("key", "lovable_credits_alert").maybeSingle();
      return new Response(JSON.stringify({
        enabled: !!data?.value?.enabled,
        message: data?.value?.message ?? "",
        eta_minutes: data?.value?.eta_minutes ?? null,
        updated_at: data?.updated_at ?? null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!action || !orderId) {
      return new Response(JSON.stringify({ error: "missing action or id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação estrita do orderId para evitar PostgREST filter injection.
    // Aceita apenas UUID (id local) ou um identificador alfanumérico curto
    // (provider_pedido_id). Qualquer outra coisa é rejeitada antes de chegar
    // nas chamadas `.or(...)` abaixo.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const PEDIDO_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    if (!UUID_RE.test(orderId) && !PEDIDO_RE.test(orderId)) {
      return new Response(JSON.stringify({ error: "invalid id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Cliente envia o nome do workspace na etapa de configuração (pedidos manuais) ===
    if (action === "set_workspace") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      let workspaceName = "";
      try {
        const payload = await req.json();
        workspaceName = String(payload?.workspace_name ?? "").trim();
      } catch { /* ignore */ }
      if (!workspaceName) {
        return new Response(JSON.stringify({ error: "workspace_name é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row } = await admin
        .from("reseller_credit_purchases")
        .select("id, provider_pedido_id, status")
        .or(`provider_pedido_id.eq.${orderId},id.eq.${orderId}`)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const status = String(row.status ?? "");
      if (status !== "manual_aceito") {
        return new Response(JSON.stringify({ error: "Pedido não está aguardando configuração" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin
        .from("reseller_credit_purchases")
        .update({ workspace_name: workspaceName })
        .eq("id", row.id);
      await admin
        .from("manual_recharge_metadata")
        .update({ workspace_name: workspaceName })
        .eq("provider_pedido_id", row.provider_pedido_id);
      return new Response(JSON.stringify({ success: true, workspace_name: workspaceName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = await getMasterKey();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let path = "";
    let method: "GET" | "POST" = "GET";
    let body: string | undefined;

    // === Manual orders: served from local DB, not from the external provider ===
    if (action === "order") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const { data: local } = await admin
        .from("reseller_credit_purchases")
        .select("id, provider_pedido_id, status, credits, price_cents, cost_cents, tipo_entrega, workspace_name, workspace_id, email_conta_lovable, created_at, updated_at, provider_response, error_message")
        .or(`provider_pedido_id.eq.${orderId},id.eq.${orderId}`)
        .maybeSingle();
      const isManual =
        !!local && (
          (local.provider_response as any)?.manual === true ||
          (local.status ?? "").startsWith("manual_")
        );
      if (isManual && local) {
        const status = String(local.status ?? "manual_pendente");
        let manualNotes: string | null = null;
        try {
          const { data: meta } = await admin
            .from("manual_recharge_metadata")
            .select("notes")
            .eq("provider_pedido_id", local.provider_pedido_id)
            .maybeSingle();
          manualNotes = (meta as any)?.notes ?? null;
        } catch (_) {}
        const isDone = status === "manual_entregue" || status === "sucesso" || status === "entregue";
        const isProcessing = status === "manual_confirmado" || status === "manual_processando" || status === "processando";
        const isAceito = status === "manual_aceito";
        const isIniciado = status === "manual_iniciado";
        const isConcluido = status === "manual_concluido" || isDone;
        let statusLabel = "Pendente";
        if (isConcluido) statusLabel = "Concluído";
        else if (isIniciado) statusLabel = "Config/start";
        else if (isAceito) statusLabel = "Aceito/config";
        else if (isProcessing) statusLabel = "Em processamento";
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              manual: true,
              id: local.provider_pedido_id ?? local.id,
              pedidoId: local.provider_pedido_id ?? local.id,
              status,
              statusLabel,
              creditos: local.credits,
              precoCentavos: local.price_cents,
              tipoEntrega: local.tipo_entrega,
              workspaceName: local.workspace_name,
              // SECURITY: workspace_id, e-mail e provider_response não são
              // devolvidos em endpoint público para não vazar PII / dados internos.
              createdAt: local.created_at,
              updatedAt: local.updated_at,
              errorMessage: local.error_message,
              managerNotes: manualNotes,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    switch (action) {
      case "order":
        path = `/pedidos/${orderId}`;
        break;
      case "confirm_invite": {
        // SECURITY: only allow confirming the invite for orders that (a) exist
        // locally and (b) are currently in a state where the customer step is
        // pending — this prevents an anonymous caller who guesses/enumerates a
        // provider_pedido_id from prematurely triggering delivery for orders
        // outside their control or already completed.
        const admin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        const { data: local } = await admin
          .from("reseller_credit_purchases")
          .select("id, provider_pedido_id, status")
          .or(`provider_pedido_id.eq.${orderId},id.eq.${orderId}`)
          .maybeSingle();
        if (!local) {
          return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const st = String(local.status ?? "");
        // Terminal / advanced states must never accept a public confirm-invite call.
        const blocked = new Set([
          "sucesso",
          "entregue",
          "manual_entregue",
          "manual_concluido",
          "manual_confirmado",
          "manual_processando",
          "cancelado",
          "falha",
          "estornado",
        ]);
        if (blocked.has(st)) {
          return new Response(JSON.stringify({ error: "Pedido não está aguardando confirmação de convite" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = `/pedidos/${local.provider_pedido_id ?? orderId}/confirmar-convite`;
        method = "POST";
        body = "{}";
        break;
      }
      case "action_status": {
        const acaoId = url.searchParams.get("acao_id");
        if (!acaoId) {
          return new Response(JSON.stringify({ error: "missing acao_id" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        path = `/pedidos/${orderId}/acoes/${acaoId}`;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const r = await fetch(`${EXTERNAL_API_BASE}${path}`, {
      method,
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body,
    });
    const data = await r.json();
    // SECURITY: ao expor 'order' publicamente, remove campos sensíveis
    // (custo interno, e-mail completo, resposta crua do provedor) que
    // revelariam margem do revendedor ou dados internos do cliente.
    if (action === "order" && data && typeof data === "object") {
      const d = (data as any).data ?? data;
      if (d && typeof d === "object") {
        delete d.cost_cents;
        delete d.costCents;
        delete d.providerResponse;
        delete d.provider_response;
        if (typeof d.emailConta === "string") {
          const [u, dom] = d.emailConta.split("@");
          d.emailConta = u && dom ? `${u.slice(0, 2)}***@${dom}` : undefined;
        }
        if (typeof d.email === "string") {
          const [u, dom] = d.email.split("@");
          d.email = u && dom ? `${u.slice(0, 2)}***@${dom}` : undefined;
        }
      }
    }
    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
