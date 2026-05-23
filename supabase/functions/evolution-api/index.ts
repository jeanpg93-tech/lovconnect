import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_BASE = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function evo(path: string, init: RequestInit = {}) {
  const r = await fetch(`${EVO_BASE}${path}`, {
    ...init,
    headers: {
      apikey: EVO_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const txt = await r.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return { ok: r.ok, status: r.status, data };
}

function instanceNameFor(resellerId: string) {
  return `rev_${resellerId.replace(/-/g, "").slice(0, 12)}`;
}

function onlyDigits(s: string) {
  return (s ?? "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!EVO_BASE || !EVO_KEY) {
    return json({ error: "Evolution API não configurada pelo gerente" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: reseller } = await svc
      .from("resellers")
      .select("id, is_active, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Apenas revendedores ativos" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const instance = instanceNameFor(reseller.id);

    // garante row da integração
    await svc.from("reseller_integrations").upsert(
      { reseller_id: reseller.id, instance_name: instance },
      { onConflict: "reseller_id" }
    );

    if (action === "connect") {
      // Tenta criar instância (ignora se já existir)
      const created = await evo("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });
      // se 403/409 = já existe, segue
      if (!created.ok && ![201, 200, 403, 409].includes(created.status)) {
        // tenta mesmo assim o connect abaixo
        console.warn("evo create returned", created.status, created.data);
      }

      // Solicita QR (Evolution v2: GET /instance/connect/{name})
      const conn = await evo(`/instance/connect/${encodeURIComponent(instance)}`, { method: "GET" });
      const qr =
        conn.data?.qrcode?.base64 ??
        conn.data?.base64 ??
        conn.data?.qr ??
        conn.data?.qrcode ??
        null;
      const pairingCode = conn.data?.pairingCode ?? conn.data?.code ?? null;

      await svc.from("reseller_integrations").update({
        evolution_instance: instance,
        connection_status: "connecting",
      }).eq("reseller_id", reseller.id);

      return json({ ok: true, instance, qr, pairingCode, raw: conn.data });
    }

    if (action === "status") {
      const st = await evo(`/instance/connectionState/${encodeURIComponent(instance)}`, { method: "GET" });
      const state: string =
        st.data?.instance?.state ??
        st.data?.state ??
        "unknown";

      const mapped =
        state === "open" ? "connected" :
        state === "connecting" ? "connecting" :
        state === "close" || state === "closed" ? "disconnected" : state;

      const update: Record<string, unknown> = { connection_status: mapped };

      if (mapped === "connected") {
        update.last_connected_at = new Date().toISOString();
        // Busca perfil
        const fi = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, { method: "GET" });
        const rec = Array.isArray(fi.data) ? fi.data[0] : fi.data;
        const inst = rec?.instance ?? rec;
        const profileName = inst?.profileName ?? inst?.profilePictureName ?? inst?.owner ?? null;
        const profilePic = inst?.profilePictureUrl ?? inst?.profilePicUrl ?? null;
        const number = inst?.number ?? inst?.owner ?? inst?.wuid ?? null;
        update.profile_name = profileName;
        update.profile_picture_url = profilePic;
        update.profile_number = typeof number === "string" ? number.split("@")[0] : null;
      }

      await svc.from("reseller_integrations").update(update).eq("reseller_id", reseller.id);

      return json({ ok: true, state: mapped, raw: st.data });
    }

    if (action === "disconnect") {
      const r = await evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
      await svc.from("reseller_integrations").update({
        connection_status: "disconnected",
        profile_name: null,
        profile_picture_url: null,
        profile_number: null,
      }).eq("reseller_id", reseller.id);
      return json({ ok: true, raw: r.data });
    }

    if (action === "send_test") {
      const number = onlyDigits(String(body.number ?? ""));
      const text = String(body.text ?? "✅ Teste de integração WhatsApp via Evolution API");
      if (number.length < 10) return json({ error: "WhatsApp inválido" }, 400);
      const r = await evo(`/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        body: JSON.stringify({ number, text }),
      });
      if (!r.ok) return json({ ok: false, error: "Falha ao enviar", details: r.data }, 502);
      await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller.id });
      return json({ ok: true, raw: r.data });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[evolution-api]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});
