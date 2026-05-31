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

    // Authorize: caller must be a gerente
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
    const displayName = body.display_name ? String(body.display_name) : email;
    if (!email || !password) return json({ error: "email and password required" }, 400);
    if (password.length < 6) return json({ error: "password must be at least 6 chars" }, 400);

    // Use any active affiliate code so handle_new_user trigger accepts the signup
    const { data: affRow } = await admin
      .from("affiliate_codes")
      .select("code")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const affCode = (affRow as any)?.code ?? null;
    if (!affCode) return json({ error: "no active affiliate code available" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { affiliate_code: affCode, display_name: displayName },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "create failed" }, 400);
    const userId = created.user.id;

    // Profile created by trigger as pending — promote to approved and clear onboarding gates
    await admin.from("profiles").update({
      display_name: displayName,
      whatsapp: "00000000000",
      must_change_password: false,
      approval_status: "approved",
    }).eq("id", userId);

    await admin.from("user_roles").upsert(
      { user_id: userId, role: "revendedor" },
      { onConflict: "user_id,role" },
    );

    const slugBase = ("demo-" + email.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "demo";
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await admin.from("resellers").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data: reseller, error: rErr } = await admin.from("resellers").insert({
      user_id: userId,
      display_name: displayName,
      slug,
      is_active: true,
      activation_status: "active",
      billing_mode: "normal",
      subscription_onboarding_completed: true,
      subscription_blocked: false,
      is_demo: true,
    } as any).select("id").single();
    if (rErr) return json({ error: rErr.message, user_id: userId }, 400);

    // Give a starter balance so demo can simulate purchases
    await admin.rpc("credit_reseller_balance", {
      _reseller_id: reseller.id,
      _amount_cents: 25000,
      _kind: "manual_credit",
      _description: "Saldo inicial — conta demo",
      _reference_id: null,
    });

    return json({ ok: true, user_id: userId, reseller_id: reseller.id, slug, email, password });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});