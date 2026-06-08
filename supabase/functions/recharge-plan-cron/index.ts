import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Janela de 2h após o cliente confirmar o início. Se nada foi entregue,
// cancela a assinatura para reembolso manual.
const INACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - INACTIVITY_WINDOW_MS).toISOString();

    // 1) Auto-cancelar: status=active, started_at < now-2h, e NENHUMA entrega delivered.
    const { data: stuck } = await db
      .from("reseller_recharge_plan_subscriptions")
      .select("id, started_at, reseller_id, cost_cents, plan_id")
      .eq("status", "active")
      .lt("started_at", cutoff);

    const cancelled: string[] = [];
    for (const s of (stuck ?? []) as {
      id: string;
      started_at: string;
      reseller_id: string;
      cost_cents: number;
      plan_id: string;
    }[]) {
      const { count } = await db
        .from("recharge_plan_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", s.id)
        .eq("status", "delivered");
      if ((count ?? 0) > 0) continue;
      const { error } = await db
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: now.toISOString(),
          cancelled_reason:
            "Entrega não iniciada em até 2h após confirmação — pedido cancelado automaticamente",
        })
        .eq("id", s.id)
        .eq("status", "active");
      if (!error) {
        cancelled.push(s.id);
        if (s.cost_cents > 0) {
          await db.rpc("credit_reseller_balance", {
            _reseller_id: s.reseller_id,
            _amount_cents: s.cost_cents,
            _kind: "recharge_plan_refund",
            _description: `Estorno automático (entrega não iniciada em 2h) — assinatura ${s.id}`,
            _reference_id: null,
          });
        }
      }
    }

    // 2) Auto-completar: assinaturas active cujas TODAS entregas são delivered ou skipped.
    const { data: actives } = await db
      .from("reseller_recharge_plan_subscriptions")
      .select("id, duration_days")
      .eq("status", "active");

    const completed: string[] = [];
    for (const s of (actives ?? []) as { id: string; duration_days: number }[]) {
      const { data: rows } = await db
        .from("recharge_plan_deliveries")
        .select("status")
        .eq("subscription_id", s.id);
      const list = (rows ?? []) as { status: string }[];
      if (list.length < s.duration_days) continue;
      const allDone = list.every(
        (x) => x.status === "delivered" || x.status === "skipped",
      );
      if (!allDone) continue;
      const { error } = await db
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "completed",
          completed_at: now.toISOString(),
        })
        .eq("id", s.id)
        .eq("status", "active");
      if (!error) completed.push(s.id);
    }

    // 3) Expirar: ends_at < now e ainda active → expired.
    const { data: expiredRows } = await db
      .from("reseller_recharge_plan_subscriptions")
      .update({ status: "expired" })
      .eq("status", "active")
      .lt("ends_at", now.toISOString())
      .select("id");

    return json({
      ok: true,
      now: now.toISOString(),
      cancelled_count: cancelled.length,
      completed_count: completed.length,
      expired_count: (expiredRows ?? []).length,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});