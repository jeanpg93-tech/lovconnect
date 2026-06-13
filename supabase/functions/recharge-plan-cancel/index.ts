import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    // Apenas gerente/admin pode cancelar manualmente
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const subscriptionId = String(body.subscription_id ?? "").trim();
    const reason = String(body.reason ?? "Cancelado manualmente pelo gerente").trim();
    if (!subscriptionId) return json({ error: "missing_subscription_id" }, 400);

    const { data: sub, error: subErr } = await admin
      .from("reseller_recharge_plan_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (subErr || !sub) return json({ error: "subscription_not_found" }, 404);

    const finalStates = ["cancelled", "completed", "expired"];
    if (finalStates.includes(sub.status)) {
      return json({ error: "already_finalized", current_status: sub.status }, 409);
    }

    // Calcula reembolso proporcional: dias pendentes + falhas
    const { data: deliveries } = await admin
      .from("recharge_plan_deliveries")
      .select("status")
      .eq("subscription_id", subscriptionId);
    const list = (deliveries ?? []) as { status: string }[];
    const refundableCount = list.filter(
      (d) => d.status === "pending" || d.status === "failed",
    ).length;

    const durationDays = Number(sub.duration_days) || 0;
    const costCents = Number(sub.cost_cents) || 0;
    let refundCents = 0;
    if (list.length === 0) {
      // Sem entregas geradas (cliente ainda não iniciou) → estorno total
      refundCents = costCents;
    } else if (durationDays > 0 && refundableCount > 0) {
      refundCents = Math.floor((costCents * refundableCount) / durationDays);
    }

    const now = new Date().toISOString();

    // Cancela
    const { error: upErr } = await admin
      .from("reseller_recharge_plan_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_reason: reason,
      })
      .eq("id", subscriptionId)
      .not("status", "in", `(${finalStates.map((s) => `"${s}"`).join(",")})`);
    if (upErr) return json({ error: upErr.message }, 500);

    // Marca entregas pendentes/falhas restantes como skipped (não vai mais rodar)
    if (refundableCount > 0) {
      await admin
        .from("recharge_plan_deliveries")
        .update({ status: "skipped", notes: "Plano cancelado" })
        .eq("subscription_id", subscriptionId)
        .in("status", ["pending", "failed"]);
    }

    // Estorna saldo do revendedor
    if (refundCents > 0) {
      const { error: refundErr } = await admin.rpc("credit_reseller_balance", {
        _reseller_id: sub.reseller_id,
        _amount_cents: refundCents,
        _kind: "recharge_plan_refund",
        _description: `Estorno cancelamento manual (${refundableCount}/${durationDays} dias) — assinatura ${subscriptionId}`,
        _reference_id: null,
      });
      if (refundErr) {
        return json({
          error: "refund_failed",
          detail: refundErr.message,
          cancelled: true,
        }, 500);
      }
    }

    // Webhook plan.cancelled (best-effort, apenas se origem foi API)
    try {
      if (sub.source === "api" && sub.source_reference_id) {
        const { data: key } = await admin
          .from("reseller_api_keys")
          .select("id, webhook_url, webhook_events, is_active, revoked_at")
          .eq("id", sub.source_reference_id)
          .maybeSingle();
        if (key && !key.revoked_at && key.is_active && key.webhook_url) {
          const list: string[] | null = Array.isArray(key.webhook_events) ? key.webhook_events : null;
          const allowed = (list && list.length > 0)
            ? list.includes("plan.cancelled")
            : true;
          if (allowed) {
            await admin.from("reseller_api_webhook_deliveries").insert({
              api_key_id: key.id,
              reseller_id: sub.reseller_id,
              event: "plan.cancelled",
              target_url: key.webhook_url,
              payload: {
                event: "plan.cancelled",
                subscription_id: subscriptionId,
                reseller_id: sub.reseller_id,
                reason,
                refund_cents: refundCents,
                refundable_days: refundableCount,
                duration_days: durationDays,
                occurred_at: now,
              },
            });
          }
        }
      }
    } catch (e) {
      console.error("plan.cancelled webhook enqueue failed", e);
    }

    return json({
      ok: true,
      subscription_id: subscriptionId,
      refund_cents: refundCents,
      refundable_days: refundableCount,
      duration_days: durationDays,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});