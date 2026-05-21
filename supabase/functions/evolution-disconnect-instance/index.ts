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
    // logout
    await fetch(`${EVO_URL}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: EVO_KEY },
    }).catch(() => {});

    await svc.from("reseller_integrations").upsert({
      reseller_id: reseller.id,
      instance_name: instanceName,
      connection_status: "disconnected",
      evolution_enabled: false,
    }, { onConflict: "reseller_id" });

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
