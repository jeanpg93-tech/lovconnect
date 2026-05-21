import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVO_URL = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
    const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution API não configurada" }, 500);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const license_key = String(body.license_key ?? "").trim();
    const display_name = String(body.display_name ?? "").trim().slice(0, 100);
    const license_type = String(body.license_type ?? "").trim();
    const whatsapp_raw = String(body.whatsapp ?? "");
    const whatsapp = whatsapp_raw.replace(/\D+/g, "").slice(0, 15);

    if (!license_key) return json({ error: "license_key obrigatório" }, 400);
    if (display_name.length < 2) return json({ error: "Nome obrigatório" }, 400);
    if (whatsapp.length < 10 || whatsapp.length > 13) return json({ error: "WhatsApp inválido" }, 400);

    const svc = createClient(SUPABASE_URL, SERVICE);

    // Tenta achar uma instância conectada: do reseller do usuário OU qualquer conectada
    const { data: reseller } = await svc.from("resellers")
      .select("id").eq("user_id", user.id).maybeSingle();

    let integ: { instance_name: string | null; reseller_id: string } | null = null;
    if (reseller) {
      const { data } = await svc
        .from("reseller_integrations")
        .select("instance_name, reseller_id, connection_status")
        .eq("reseller_id", reseller.id)
        .maybeSingle();
      if (data?.connection_status === "connected" && data.instance_name) {
        integ = { instance_name: data.instance_name, reseller_id: data.reseller_id };
      }
    }
    if (!integ) {
      const { data } = await svc
        .from("reseller_integrations")
        .select("instance_name, reseller_id")
        .eq("connection_status", "connected")
        .not("instance_name", "is", null)
        .limit(1)
        .maybeSingle();
      if (data?.instance_name) integ = { instance_name: data.instance_name, reseller_id: data.reseller_id };
    }
    if (!integ) return json({ error: "Nenhuma instância WhatsApp conectada" }, 400);

    const { data: tplRow } = await svc
      .from("app_settings").select("value").eq("key", "evolution_message_template").maybeSingle();
    const tpl = (typeof tplRow?.value === "string" ? tplRow.value : (tplRow?.value as any)) ||
      "Olá {nome}! ✅ Sua licença {tipo} foi gerada.\n\n🔑 Chave: {chave}\n\nGuarde com cuidado.";
    const message = String(tpl)
      .replaceAll("{nome}", display_name)
      .replaceAll("{chave}", license_key)
      .replaceAll("{tipo}", license_type);

    const number = whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`;
    const evoResp = await fetch(
      `${EVO_URL}/message/sendText/${encodeURIComponent(integ.instance_name!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVO_KEY },
        body: JSON.stringify({ number, text: message }),
      },
    );
    const evoText = await evoResp.text().catch(() => "");
    if (!evoResp.ok) {
      return json({ error: `Evolution retornou ${evoResp.status}`, details: evoText }, 502);
    }
    await svc.rpc("increment_evolution_messages_sent", { _reseller_id: integ.reseller_id });
    return json({ ok: true });
  } catch (e) {
    console.error("[send-license-whatsapp]", e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
