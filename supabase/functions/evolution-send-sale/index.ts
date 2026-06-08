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

async function instanceTokenFor(resellerId: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`lovconnect:evolution-go:${resellerId}`),
  );
  const chars = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only trusted server-side callers (other edge functions) may invoke this.
  // Require the service-role bearer token.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token !== SERVICE_ROLE_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!EVO_BASE || !EVO_KEY) {
    return json({ ok: false, skipped: "evolution_not_configured" });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const reseller_id = String(body.reseller_id ?? "");
    const kind = String(body.kind ?? ""); // "license" | "recharge" | "storefront"
    let to = (String(body.to ?? "")).replace(/\D+/g, "");
    const vars = (body.vars ?? {}) as Record<string, string>;

    if (!reseller_id || !kind || to.length < 10) {
      return json({ ok: false, skipped: "invalid_input" });
    }

    // Garante DDI Brasil (55). Aceita números no formato:
    // - 10 dígitos (DDD+fixo)        -> prepend 55
    // - 11 dígitos (DDD+celular 9)   -> prepend 55
    // - 12/13 dígitos começando com 55 -> mantém
    if (to.length === 10 || to.length === 11) {
      to = "55" + to;
    } else if (to.length >= 12 && !to.startsWith("55")) {
      // número internacional já com DDI — mantém como está
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // DEMO GUARD — não envia mensagem real para clientes de conta demo
    const { data: demoCheck } = await svc
      .from("resellers").select("is_demo").eq("id", reseller_id).maybeSingle();
    if ((demoCheck as any)?.is_demo) {
      return json({ ok: true, demo: true, skipped: "demo_account" });
    }

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

    // Evolution GO: usa /send/text com o token derivado da instância (mesmo padrão do connect/send_test).
    const instanceToken = await instanceTokenFor(reseller_id);
    const r = await fetch(`${EVO_BASE}/send/text`, {
      method: "POST",
      headers: { apikey: instanceToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number: to, text }),
    });
    const txt = await r.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!r.ok) {
      console.warn("[evolution-send-sale] send failed", r.status, data);
      // Fallback: tenta endpoint antigo da Evolution API v2 caso o servidor seja a versão clássica.
      const r2 = await fetch(`${EVO_BASE}/message/sendText/${encodeURIComponent(integ.evolution_instance)}`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: to, text }),
      });
      const txt2 = await r2.text();
      let data2: any = null;
      try { data2 = JSON.parse(txt2); } catch { data2 = { raw: txt2 }; }
      if (!r2.ok) {
        console.warn("[evolution-send-sale] fallback send failed", r2.status, data2);
        return json({ ok: false, error: "send_failed", status: r2.status, details: data2 });
      }
      await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller_id });
      return json({ ok: true, via: "legacy" });
    }

    await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller_id });
    return json({ ok: true, via: "evolution-go" });
  } catch (e) {
    console.error("[evolution-send-sale]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "erro" });
  }
});
