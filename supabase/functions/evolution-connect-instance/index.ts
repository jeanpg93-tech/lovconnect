import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution não configurada pelo gerente" }, 500);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE);
    const { data: reseller } = await svc.from("resellers")
      .select("id,is_active").eq("user_id", user.id).maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Apenas revendedores" }, 403);

    const instanceName = `reseller-${reseller.id}`;

    // garante linha de integrations
    await svc.from("reseller_integrations").upsert({
      reseller_id: reseller.id,
      instance_name: instanceName,
      connection_status: "connecting",
      evolution_enabled: true,
    }, { onConflict: "reseller_id" });

    // 1) Verifica se já existe; senão cria
    const fetchOpts = { headers: { apikey: EVO_KEY, "Content-Type": "application/json" } };
    const list = await fetch(`${EVO_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, fetchOpts);
    const listText = await list.text();
    let exists = false;
    try {
      const arr = JSON.parse(listText);
      exists = Array.isArray(arr) && arr.length > 0;
    } catch { /* ignore */ }

    if (!exists) {
      const createResp = await fetch(`${EVO_URL}/instance/create`, {
        method: "POST",
        headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      const createText = await createResp.text();
      let createData: any = null;
      try { createData = JSON.parse(createText); } catch { createData = { raw: createText }; }
      if (!createResp.ok) {
        return json({ error: "Falha ao criar instância", details: createData, status: createResp.status }, 502);
      }
      // create já costuma retornar qrcode
      const qr = createData?.qrcode?.base64 ?? createData?.base64 ?? null;
      const code = createData?.qrcode?.code ?? createData?.code ?? null;
      if (qr || code) {
        return json({ ok: true, instance: instanceName, qr, code, status: "connecting" });
      }
    }

    // 2) Pede QR via /instance/connect
    const connectResp = await fetch(`${EVO_URL}/instance/connect/${encodeURIComponent(instanceName)}`, {
      method: "GET",
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    });
    const connectText = await connectResp.text();
    let connectData: any = null;
    try { connectData = JSON.parse(connectText); } catch { connectData = { raw: connectText }; }

    if (!connectResp.ok) {
      return json({ error: "Falha ao gerar QR", details: connectData, status: connectResp.status }, 502);
    }

    const qr = connectData?.base64 ?? connectData?.qrcode?.base64 ?? null;
    const code = connectData?.code ?? connectData?.qrcode?.code ?? null;

    return json({ ok: true, instance: instanceName, qr, code, status: "connecting" });
  } catch (e) {
    console.error("[evolution-connect]", e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
