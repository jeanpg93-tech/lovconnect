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

    switch (action) {
      case "order":
        path = `/pedidos/${orderId}`;
        break;
      case "confirm_invite":
        path = `/pedidos/${orderId}/confirmar-convite`;
        method = "POST";
        body = "{}";
        break;
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
