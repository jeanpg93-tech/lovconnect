import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const LOVAX_DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getActiveDeliveryMethod(svc: any): Promise<"flow" | "lovax"> {
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", "licencas.delivery.method")
    .maybeSingle();
  const m = (data?.value as any)?.method;
  return m === "lovax" ? "lovax" : "flow";
}

async function getLovaxCreds(svc: any): Promise<{ apiKey: string; base: string } | null> {
  const { data } = await svc
    .from("app_settings")
    .select("key, value")
    .in("key", ["lovax_api_token", "lovax_base_url"]);
  const tk = data?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
  const bs = (data?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined) || LOVAX_DEFAULT_BASE;
  if (!tk) return null;
  return { apiKey: tk, base: bs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Endpoint público: chamado pela storefront do revendedor (cliente final
    // sem login). A segurança vem de: (1) precisa conhecer a license_key,
    // (2) flag reset_device_enabled da loja, (3) provedor valida o dono.

    const body = await req.json().catch(() => ({}));
    const license_key = typeof body.license_key === "string" ? body.license_key.trim() : "";

    if (!license_key) return json({ error: "license_key obrigatório" }, 400);

    // Confirma que esse pedido existe e não é legado.
    // Também precisamos do reseller_id para validar o flag reset_device_enabled
    // configurado na storefront do revendedor.
    const { data: order } = await svc.from("orders")
      .select("id, is_legacy, reseller_id")
      .eq("license_key", license_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Se não achou em 'orders', tenta em 'storefront_orders' (vendas da loja pública)
    let storefrontOrder = null;
    if (!order) {
      const { data: so } = await svc.from("storefront_orders")
        .select("id, is_legacy, reseller_id")
        .eq("license_key", license_key)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      storefrontOrder = so;
    }

    // Se não encontrada em nenhuma tabela, ainda assim tentamos no provedor:
    // existem licenças válidas geradas fora do registro local (ex.: criadas
    // diretamente no provedor antigo) que continuam funcionando no upstream.
    const isLegacy = order?.is_legacy || storefrontOrder?.is_legacy;
    if (isLegacy) {
      return json({
        error: "Licença legado: foi gerada pelo provedor anterior e não pode ser resetada automaticamente.",
      }, 409);
    }

    // Aplica o flag reset_device_enabled do revendedor dono do pedido (quando
    // conseguimos identificar o reseller_id). Licenças não rastreadas localmente
    // seguem o comportamento legado (passa direto ao provedor).
    const resellerId = order?.reseller_id ?? storefrontOrder?.reseller_id ?? null;
    if (resellerId) {
      const { data: storefront } = await svc.from("reseller_storefronts")
        .select("reset_device_enabled")
        .eq("reseller_id", resellerId)
        .maybeSingle();
      if (storefront && storefront.reset_device_enabled === false) {
        return json({
          error: "Reset de dispositivo desativado para esta loja. Entre em contato com o revendedor.",
        }, 403);
      }
    }

    // Roteia conforme o método de entrega ativo (Flow ou Lovax).
    // Chaves TS- (trial) e qualquer chave gerada enquanto o método ativo for Lovax
    // precisam ser resetadas no upstream Lovax — chamar o Flow retorna 404.
    const activeMethod = await getActiveDeliveryMethod(svc);

    let providerData: any = null;
    let providerStatus = 0;
    try {
      if (activeMethod === "lovax") {
        const creds = await getLovaxCreds(svc);
        if (!creds) return json({ error: "MétodoLovax não configurado" }, 502);
        const r = await fetch(creds.base, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.apiKey}`,
            "x-api-key": creds.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "reset_hwid", payload: { license_key } }),
        });
        providerStatus = r.status;
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        // Lovax retorna 200 com success:false em alguns erros
        if (r.ok && providerData?.success === false) {
          providerStatus = 409;
        }
      } else {
        const { data: cfg } = await svc.from("provider_settings")
          .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_BASE;
        if (!provKey) return json({ error: "Provedor não configurado" }, 502);
        const r = await fetch(`${base}/reset-hwid`, {
          method: "POST",
          headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
          body: JSON.stringify({ license_key }),
        });
        providerStatus = r.status;
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
      }
    } catch (e) {
      console.error("[license-reset-device] provider call failed", e);
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
