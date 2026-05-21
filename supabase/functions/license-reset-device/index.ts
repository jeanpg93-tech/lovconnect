import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const license_key = typeof body.license_key === "string" ? body.license_key.trim() : "";

    if (!license_key) return json({ error: "license_key obrigatório" }, 400);

    // Confirma que esse pedido existe e não é legado
    const { data: order } = await svc.from("orders")
      .select("id, is_legacy")
      .eq("license_key", license_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Se não achou em 'orders', tenta em 'storefront_orders' (vendas da loja pública)
    let storefrontOrder = null;
    if (!order) {
      const { data: so } = await svc.from("storefront_orders")
        .select("id, is_legacy")
        .eq("license_key", license_key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      storefrontOrder = so;
    }

    if (!order && !storefrontOrder) return json({ error: "Licença não encontrada no sistema" }, 404);
    
    const isLegacy = order?.is_legacy || storefrontOrder?.is_legacy;
    if (isLegacy) {
      return json({
        error: "Licença legado: foi gerada pelo provedor anterior e não pode ser resetada automaticamente.",
      }, 409);
    }

    // Provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;
    if (!provKey) return json({ error: "Provedor não configurado" }, 502);

    let providerData: any = null;
    let providerStatus = 0;
    try {
      const r = await fetch(`${base}/reset-hwid`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ license_key }),
      });
      providerStatus = r.status;
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
    } catch (e) {
      return json({ error: "Erro ao chamar provedor", details: e instanceof Error ? e.message : null }, 502);
    }

    if (providerStatus < 200 || providerStatus >= 300) {
      const detailMsg =
        typeof providerData === "object" && providerData?.error
          ? String(providerData.error)
          : null;

      if (providerStatus === 403 || providerStatus === 404) {
        return json({
          error: "Esta licença não pode ser resetada por aqui (chave de provedor incompatível ou licença inexistente no upstream).",
          provider_status: providerStatus,
          provider_message: detailMsg,
        }, 409);
      }

      return json({
        error: detailMsg ?? "Provedor falhou",
        provider_status: providerStatus,
      }, providerStatus || 502);
    }

    return json({ success: true, license_key });
  } catch (e: any) {
    console.error("[license-reset-device] global error", e);
    return json({ error: "Erro interno", details: e.message }, 500);
  }
});
