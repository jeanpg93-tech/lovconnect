import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supaUrl, serviceKey);

    // Authorize: caller must be a gerente OR call with service role key
    if (token !== serviceKey) {
      const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isG } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "gerente" });
      if (!isG) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = body.display_name ? String(body.display_name) : null;
    if (!email || !password) return json({ error: "email and password required" }, 400);

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "create failed" }, 400);
    const userId = created.user.id;

    // Profile (force password change on first access; leave display_name/whatsapp empty so gate triggers)
    await admin.from("profiles").upsert({
      id: userId,
      email,
      display_name: displayName,
      whatsapp: null,
      must_change_password: true,
      approval_status: "approved",
    }, { onConflict: "id" });

    // Role
    await admin.from("user_roles").upsert({ user_id: userId, role: "revendedor" }, { onConflict: "user_id,role" });

    // Reseller in subscription mode (manager will create initial charge)
    const slugBase = email.split("@")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rev";
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await admin.from("resellers").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data: reseller, error: rErr } = await admin.from("resellers").insert({
      user_id: userId,
      display_name: displayName ?? email,
      slug,
      is_active: true,
      activation_status: "active",
      billing_mode: "subscription",
      subscription_onboarding_completed: false,
      subscription_blocked: false,
    }).select("id").single();
    if (rErr) return json({ error: rErr.message, user_id: userId }, 400);

    return json({ ok: true, user_id: userId, reseller_id: reseller.id, slug });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});