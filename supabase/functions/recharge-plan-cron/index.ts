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

async function enqueuePlanWebhook(
  db: any,
  sub: any,
  event: string,
  extra: Record<string, unknown> = {},
) {
  try {
    const apiKeyId = sub?.source === "api" ? sub?.source_reference_id : null;
    if (!apiKeyId) return;
    const { data: key } = await db
      .from("reseller_api_keys")
      .select("id, webhook_url, webhook_events, is_active, revoked_at")
      .eq("id", apiKeyId)
      .maybeSingle();
    if (!key || key.revoked_at || !key.is_active || !key.webhook_url) return;
    const defaults = ["plan.sold", "plan.completed", "plan.cancelled"];
    const list: string[] | null = Array.isArray(key.webhook_events) ? key.webhook_events : null;
    if (list && list.length > 0) {
      if (!list.includes(event)) return;
    } else if (!defaults.includes(event)) return;
    await db.from("reseller_api_webhook_deliveries").insert({
      api_key_id: key.id,
      reseller_id: sub.reseller_id,
      event,
      target_url: key.webhook_url,
      payload: {
        event,
        subscription_id: sub.id,
        reseller_id: sub.reseller_id,
        occurred_at: new Date().toISOString(),
        ...extra,
      },
    });
  } catch (e) {
    console.error("enqueuePlanWebhook failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const now = new Date();
    // Auto-cancelamento por inatividade foi REMOVIDO.
    // Após o Owner ser confirmado, a assinatura nunca deve ser cancelada
    // automaticamente — as entregas ocorrem no horário agendado (delivery_hour)
    // e o gerente é quem decide manualmente se precisa cancelar/reembolsar.
    const cancelled: string[] = [];

    // 1) AUTO-ENTREGA: marca como "delivered" toda entrega pendente cuja
    //    data agendada (em BRT) já chegou e cuja hora atual (BRT) já passou
    //    do delivery_hour da assinatura.
    //    BRT = UTC-3 (sem horário de verão desde 2019).
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayBRT = brtNow.toISOString().slice(0, 10);
    const hourBRT = brtNow.getUTCHours();

    const { data: pendingRows } = await db
      .from("recharge_plan_deliveries")
      .select(
        "id, day_number, subscription_id, scheduled_date, reseller_recharge_plan_subscriptions!inner(status, delivery_hour)",
      )
      .eq("status", "pending")
      .lte("scheduled_date", todayBRT)
      .eq("reseller_recharge_plan_subscriptions.status", "active");

    const autoDelivered: string[] = [];
    for (const d of (pendingRows ?? []) as any[]) {
      const sub = d.reseller_recharge_plan_subscriptions;
      const deliveryHour = Number(sub?.delivery_hour ?? 21);
      // Se for um dia anterior, entrega independente da hora atual.
      // Se for hoje, só entrega quando hora BRT >= delivery_hour.
      const isToday = d.scheduled_date === todayBRT;
      if (isToday && hourBRT < deliveryHour) continue;
      const { error } = await db
        .from("recharge_plan_deliveries")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          notes: "Entrega automática",
        })
        .eq("id", d.id)
        .eq("status", "pending");
      if (!error) {
        autoDelivered.push(d.id);
        // Webhook opt-in plan.delivery.completed
        const { data: subRow } = await db
          .from("reseller_recharge_plan_subscriptions")
          .select("id, reseller_id, source, source_reference_id, duration_days, credits_per_day")
          .eq("id", d.subscription_id)
          .maybeSingle();
        if (subRow) {
          await enqueuePlanWebhook(db, subRow, "plan.delivery.completed", {
            day_number: d.day_number,
            scheduled_date: d.scheduled_date,
            credits: subRow.credits_per_day,
            duration_days: subRow.duration_days,
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
      if (!error) {
        completed.push(s.id);
        const { data: subRow } = await db
          .from("reseller_recharge_plan_subscriptions")
          .select("id, reseller_id, source, source_reference_id, duration_days, credits_per_day, total_credits_cap, cost_cents, sale_price_cents")
          .eq("id", s.id)
          .maybeSingle();
        if (subRow) {
          await enqueuePlanWebhook(db, subRow, "plan.completed", {
            duration_days: subRow.duration_days,
            credits_per_day: subRow.credits_per_day,
            total_credits: subRow.total_credits_cap,
            cost_cents: subRow.cost_cents,
            sale_price_cents: subRow.sale_price_cents,
          });
        }
      }
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
      auto_delivered_count: autoDelivered.length,
      cancelled_count: cancelled.length,
      completed_count: completed.length,
      expired_count: (expiredRows ?? []).length,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});