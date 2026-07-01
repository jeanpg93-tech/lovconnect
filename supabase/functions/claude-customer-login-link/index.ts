// Envia um magic link para um email já cadastrado como cliente Claude.
// Público: sem JWT.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const redirect_to = String(body?.redirect_to ?? "").trim() || undefined;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    // Verifica se é cliente claude (não vaza se não for)
    const { data: cust } = await admin
      .from("claude_customers")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (!cust) return json({ success: true }); // resposta genérica p/ não enumerar

    const { error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: redirect_to },
    });
    if (error) return json({ error: "magic_link_failed", detail: error.message }, 500);

    return json({ success: true });
  } catch (e) {
    console.error("[claude-customer-login-link]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});