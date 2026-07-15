const TOKEN = "a25d460e7ca4499cae9c8a5081831eb75ed942d769154def9f1ae6712051faf0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-lovabase-migration-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const EXCLUDE_EXACT = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR",
  "USER", "LANG", "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
]);

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const token = req.headers.get("x-lovabase-migration-token");
  if (token !== TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const all = Deno.env.toObject();
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (EXCLUDE_EXACT.has(k)) continue;
    if (k.startsWith("XDG_") || k.startsWith("DENO_") || k.startsWith("SUPABASE_")) continue;
    filtered[k] = v;
  }

  return new Response(JSON.stringify({ secrets: filtered }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});