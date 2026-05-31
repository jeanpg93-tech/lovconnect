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
    const resellerId = String(body.reseller_id ?? "");
    if (!resellerId) return json({ error: "reseller_id required" }, 400);

    // Safety: only allow deletion of demo accounts
    const { data: r, error: rErr } = await admin
      .from("resellers")
      .select("id, user_id, is_demo")
      .eq("id", resellerId)
      .maybeSingle();
    if (rErr || !r) return json({ error: "reseller not found" }, 404);
    if (!(r as any).is_demo) return json({ error: "refusing to delete non-demo account" }, 403);

    const userId = (r as any).user_id as string;

    // Deleting the auth user cascades to profile (ON DELETE CASCADE) and reseller-related rows
    // that have FK to auth.users or to profiles.id. Best-effort manual cleanup first.
    const tablesByReseller = [
      "orders",
      "balance_transactions",
      "reseller_balances",
      "reseller_customers",
      "reseller_storefronts",
      "storefront_orders",
      "recharge_intents",
      "reseller_credit_purchases",
      "reseller_pack_balances",
      "reseller_pack_ledger",
      "reseller_integrations",
      "reseller_tier_state",
      "reseller_extension_price_overrides",
      "reseller_referrals",
      "pending_storefront_charges",
      "activation_payments",
      "activation_logs",
    ];
    for (const t of tablesByReseller) {
      try { await admin.from(t).delete().eq("reseller_id", resellerId); } catch { /* ignore */ }
    }
    try { await admin.from("reseller_referrals").delete().eq("referred_reseller_id", resellerId); } catch { /* ignore */ }
    try { await admin.from("resellers").delete().eq("id", resellerId); } catch { /* ignore */ }
    try { await admin.from("user_roles").delete().eq("user_id", userId); } catch { /* ignore */ }
    try { await admin.from("notifications").delete().eq("user_id", userId); } catch { /* ignore */ }
    try { await admin.from("profiles").delete().eq("id", userId); } catch { /* ignore */ }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});