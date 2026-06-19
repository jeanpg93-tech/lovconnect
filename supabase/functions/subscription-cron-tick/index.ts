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

// Given a YYYY-MM-DD date and day_of_month (1-28), return the next occurrence
// (strictly after the given date) as YYYY-MM-DD.
function nextOccurrence(fromIso: string, dom: number): string {
  const [y, m] = fromIso.split("-").map(Number);
  // try same month first; if not strictly after `from`, advance month
  let year = y, month = m;
  const candidateSame = `${year}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
  if (candidateSame > fromIso) return candidateSame;
  month += 1;
  if (month > 12) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(supabaseUrl, serviceKey);
  const today = todayBRT();
  const log: Record<string, unknown> = { today };

  try {
    // 0) Generate due recurrences (do BEFORE marking overdue so newly-created
    //    charges with today's due_date aren't accidentally overdued).
    const { data: dueRecs } = await admin
      .from("reseller_subscription_recurrences")
      .select("*")
      .eq("is_active", true)
      .lte("next_generation_date", today);
    let generated = 0;
    for (const rec of dueRecs ?? []) {
      const r: any = rec;
      const dueDate = r.next_generation_date ?? today;
      const resp = await fetch(`${supabaseUrl}/functions/v1/subscription-create-charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          reseller_id: r.reseller_id,
          kind: "monthly",
          amount_cents: r.amount_cents,
          due_date: dueDate,
          description: r.description ?? "Mensalidade",
          recurrence_id: r.id,
        }),
      });
      if (resp.ok) {
        generated++;
        const next = nextOccurrence(dueDate, r.day_of_month);
        await admin
          .from("reseller_subscription_recurrences")
          .update({ next_generation_date: next })
          .eq("id", r.id);
      } else {
        console.error("recurrence gen failed", r.id, await resp.text());
      }
    }
    log.recurrences_generated = generated;

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