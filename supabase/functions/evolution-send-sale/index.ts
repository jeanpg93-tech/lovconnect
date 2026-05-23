import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_BASE = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtBRL(cents?: number | null) {
  if (cents == null) return "—";
  return "R$ " + (Number(cents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function licenseTypeLabel(t?: string | null) {
  switch (t) {
    case "pro_1d": return "PRO 1 dia";
    case "pro_7d": return "PRO 7 dias";
    case "pro_15d": return "PRO 15 dias";
    case "pro_30d": return "PRO 30 dias";
    case "lifetime": return "Vitalícia";
    case "trial": return "Teste";
    default: return t ?? "—";
  }
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!EVO_BASE || !EVO_KEY) {
    return json({ ok: false, skipped: "evolution_not_configured" });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reseller_id = String(body.reseller_id ?? "");
    const kind = String(body.kind ?? ""); // "license" | "recharge" | "storefront"
    const to = (String(body.to ?? "")).replace(/\D+/g, "");
    const vars = (body.vars ?? {}) as Record<string, string>;

    if (!reseller_id || !kind || to.length < 10) {
      return json({ ok: false, skipped: "invalid_input" });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: integ } = await svc
      .from("reseller_integrations")
      .select("evolution_enabled, evolution_instance, evolution_message_template, evolution_template_recharge, evolution_template_storefront, connection_status")
      .eq("reseller_id", reseller_id)
      .maybeSingle();

    if (!integ?.evolution_enabled || !integ.evolution_instance || integ.connection_status !== "connected") {
      return json({ ok: false, skipped: "not_enabled_or_not_connected" });
    }

    // Resolve template
    let template: string | null = null;
    let defaultKey = "";
    if (kind === "license") {
      template = integ.evolution_message_template ?? null;
      defaultKey = "evolution_template_license";
    } else if (kind === "recharge") {
      template = (integ as any).evolution_template_recharge ?? null;
      defaultKey = "evolution_template_recharge";
    } else if (kind === "storefront") {
      template = (integ as any).evolution_template_storefront ?? null;
      defaultKey = "evolution_template_storefront";
    }

    if (!template) {
      const { data: appS } = await svc
        .from("app_settings").select("value").eq("key", defaultKey).maybeSingle();
      template = (appS?.value as string) ?? null;
    }

    if (!template) return json({ ok: false, skipped: "no_template" });

    // Enriquecer vars padrão
    const { data: reseller } = await svc
      .from("resellers").select("display_name").eq("id", reseller_id).maybeSingle();
    const enrichedVars: Record<string, string> = {
      loja: reseller?.display_name ?? "Loja",
      nome: vars.nome ?? "",
      chave: vars.chave ?? "",
      tipo: vars.tipo ? licenseTypeLabel(vars.tipo) : (vars.tipo_label ?? ""),
      link: vars.link ?? "",
      valor: vars.valor_cents ? fmtBRL(Number(vars.valor_cents)) : (vars.valor ?? ""),
    };

    const text = render(template, enrichedVars);

    const r = await fetch(`${EVO_BASE}/message/sendText/${encodeURIComponent(integ.evolution_instance)}`, {
      method: "POST",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, text }),
    });
    const txt = await r.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!r.ok) {
      console.warn("[evolution-send-sale] send failed", r.status, data);
      return json({ ok: false, error: "send_failed", status: r.status, details: data });
    }

    await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller_id });
    return json({ ok: true });
  } catch (e) {
    console.error("[evolution-send-sale]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "erro" });
  }
});
