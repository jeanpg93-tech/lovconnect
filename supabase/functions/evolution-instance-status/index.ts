import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVO_URL = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
    const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!EVO_URL || !EVO_KEY) return json({ error: "Evolution não configurada" }, 500);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE);
    const { data: reseller } = await svc.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!reseller) return json({ error: "Sem revendedor" }, 403);

    const instanceName = `reseller-${reseller.id}`;
    const r = await fetch(`${EVO_URL}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: EVO_KEY, "Content-Type": "application/json" },
    });
    const text = await r.text();
    let data: any = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    // estados Evolution: open (conectado), connecting, close
    const state = data?.instance?.state ?? data?.state ?? null;
    let status: "connected" | "connecting" | "disconnected" = "disconnected";
    if (state === "open") status = "connected";
    else if (state === "connecting") status = "connecting";

    // persiste
    const patch: Record<string, unknown> = {
      reseller_id: reseller.id,
      instance_name: instanceName,
      connection_status: status,
    };
    if (status === "connected") patch.last_connected_at = new Date().toISOString();

    // Busca perfil quando conectado
    if (status === "connected") {
      try {
        // 1) tenta /instance/fetchInstances?instanceName=...
        const fr = await fetch(
          `${EVO_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
          { headers: { apikey: EVO_KEY } },
        );
        const ftext = await fr.text();
        let fdata: any = null; try { fdata = JSON.parse(ftext); } catch { /* ignore */ }
        const item = Array.isArray(fdata) ? fdata[0] : fdata;
        const inst = item?.instance ?? item;
        const ownerJid: string | undefined =
          inst?.owner ?? inst?.ownerJid ?? inst?.wuid ?? inst?.user?.id;
        const profileName: string | undefined =
          inst?.profileName ?? inst?.profile_name ?? inst?.pushName ?? inst?.user?.name;
        let profilePic: string | undefined =
          inst?.profilePictureUrl ?? inst?.profilePicUrl ?? inst?.profile_pic_url;

        const number = ownerJid ? String(ownerJid).split("@")[0].split(":")[0] : null;

        // 2) se não tiver foto, tenta /chat/fetchProfilePictureUrl/{instance}
        if (!profilePic && number) {
          try {
            const pr = await fetch(
              `${EVO_URL}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: EVO_KEY },
                body: JSON.stringify({ number }),
              },
            );
            if (pr.ok) {
              const pj = await pr.json().catch(() => null);
              profilePic = pj?.profilePictureUrl ?? pj?.url ?? profilePic;
            }
          } catch { /* ignore */ }
        }

        if (profileName) patch.profile_name = profileName;
        if (profilePic) patch.profile_picture_url = profilePic;
        if (number) patch.profile_number = number;
      } catch (e) {
        console.warn("[evolution-status] perfil falhou", e);
      }
    } else {
      // limpa perfil quando desconectado
      patch.profile_name = null;
      patch.profile_picture_url = null;
      patch.profile_number = null;
    }

    await svc.from("reseller_integrations").upsert(patch, { onConflict: "reseller_id" });

    const { data: row } = await svc
      .from("reseller_integrations")
      .select("messages_sent_count, profile_name, profile_picture_url, profile_number, last_connected_at")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    return json({ ok: true, status, state, profile: row, raw: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
