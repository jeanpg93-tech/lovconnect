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