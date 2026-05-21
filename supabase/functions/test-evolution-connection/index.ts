import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claims, error: cErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const baseUrl = String(body.base_url ?? "").trim().replace(/\/+$/, "");
    const apiKey = String(body.api_key ?? "").trim();
    const instance = String(body.instance ?? "").trim();
    if (!baseUrl || !apiKey || !instance) {
      return json({ error: "Informe base_url, api_key e instance" }, 400);
    }

    // Endpoint padrão Evolution API: /instance/connectionState/{instance}
    const url = `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
    });
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return json({ ok: resp.ok, status: resp.status, details: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
