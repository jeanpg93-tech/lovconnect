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
    const resellerSlug = String(body?.reseller_slug ?? "").trim().toLowerCase();
    const resellerIdIn = String(body?.reseller_id ?? "").trim();
    const redirect_to = String(body?.redirect_to ?? "").trim() || undefined;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    let scopedResellerId = resellerIdIn || "";
    if (resellerSlug && !scopedResellerId) {
      const { data: reseller } = await admin
        .from("resellers")
        .select("id")
        .eq("slug", resellerSlug)
        .maybeSingle();
      scopedResellerId = reseller?.id ?? "";
    }

    // Verifica se é cliente claude (não vaza se não for)
    let customerQuery = admin
      .from("claude_customers")
      .select("id")
      .eq("email", email);
    if (scopedResellerId) customerQuery = customerQuery.eq("reseller_id", scopedResellerId);
    const { data: cust } = await customerQuery.limit(1).maybeSingle();
    if (!cust) return json({ success: true }); // resposta genérica p/ não enumerar

    const { error } = await admin.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirect_to,
      },
    });
    if (error) return json({ error: "magic_link_failed", detail: error.message }, 500);

    return json({ success: true });
  } catch (e) {
    console.error("[claude-customer-login-link]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});