// Subscription daily tick: marks overdue charges, blocks/unblocks resellers.
// Scheduled via pg_cron at 00:05 BRT (03:05 UTC).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// "today" in America/Sao_Paulo (BRT, UTC-3) as YYYY-MM-DD
function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(supabaseUrl, serviceKey);
  const today = todayBRT();
  const log: Record<string, unknown> = { today };

  try {
    // 1) Mark pending charges past due_date as overdue
    const { data: overdueRows, error: e1 } = await admin
      .from("reseller_subscription_charges")
      .update({ status: "overdue" })
      .eq("status", "pending")
      .lt("due_date", today)
      .select("id, reseller_id");
    if (e1) throw e1;
    log.marked_overdue = overdueRows?.length ?? 0;

    // 2) Block resellers in subscription mode who have any overdue charge
    //    (skip onboarding-incomplete: those are already gated by the onboarding overlay)
    const { data: overdueOpen, error: e2 } = await admin
      .from("reseller_subscription_charges")
      .select("reseller_id")
      .eq("status", "overdue");
    if (e2) throw e2;

    const toBlock = Array.from(new Set((overdueOpen ?? []).map((r: any) => r.reseller_id)));
    let blocked = 0;
    if (toBlock.length > 0) {
      const { data: blockedRows, error: e3 } = await admin
        .from("resellers")
        .update({ subscription_blocked: true, subscription_blocked_at: new Date().toISOString() })
        .eq("billing_mode", "subscription")
        .eq("subscription_onboarding_completed", true)
        .eq("subscription_blocked", false)
        .in("id", toBlock)
        .select("id");
      if (e3) throw e3;
      blocked = blockedRows?.length ?? 0;
    }
    log.blocked = blocked;

    // 3) Unblock resellers that no longer have any overdue charge
    const { data: currentlyBlocked, error: e4 } = await admin
      .from("resellers")
      .select("id")
      .eq("billing_mode", "subscription")
      .eq("subscription_blocked", true);
    if (e4) throw e4;

    let unblocked = 0;
    for (const r of currentlyBlocked ?? []) {
      const { count } = await admin
        .from("reseller_subscription_charges")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", (r as any).id)
        .eq("status", "overdue");
      if ((count ?? 0) === 0) {
        await admin
          .from("resellers")
          .update({ subscription_blocked: false, subscription_blocked_at: null })
          .eq("id", (r as any).id);
        unblocked++;
      }
    }
    log.unblocked = unblocked;

    return new Response(JSON.stringify({ ok: true, ...log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("subscription-cron-tick error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});