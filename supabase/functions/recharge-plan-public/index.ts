import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const TOKEN_RE = /^[a-f0-9]{32}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

type Sub = {
  id: string;
  reseller_id: string;
  plan_id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  owner_email_required: string;
  workspace_name: string | null;
  owner_email_added_at: string | null;
  order_token: string;
  status: string;
  cost_cents: number;
  sale_price_cents: number;
  duration_days: number;
  credits_per_day: number;
  total_credits_cap: number;
  delivery_hour: number;
  started_at: string | null;
  ends_at: string | null;
  awaiting_owner_expires_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  completed_at: string | null;
  paused_at: string | null;
  notes: string | null;
  created_at: string;
  owner_rejected_at: string | null;
  owner_rejected_reason: string | null;
  owner_rejected_count: number;
  owner_confirmation_attempts: number;
};

async function getSubByToken(db: ReturnType<typeof admin>, token: string) {
  const { data, error } = await db
    .from("reseller_recharge_plan_subscriptions")
    .select("*")
    .eq("order_token", token)
    .maybeSingle();
  if (error) throw error;
  return data as Sub | null;
}

async function buildPayload(db: ReturnType<typeof admin>, sub: Sub) {
  const { data: plan } = await db
    .from("recharge_plans")
    .select("id,name,description,duration_days,credits_per_day,total_credits_cap,delivery_hour,bot_owner_email")
    .eq("id", sub.plan_id)
    .maybeSingle();

  let deliveries: Array<{ day_number: number; scheduled_date: string; credits: number; status: string; delivered_at: string | null }> = [];
  if (sub.status === "active" || sub.status === "completed" || sub.status === "paused") {
    const { data: rows } = await db
      .from("recharge_plan_deliveries")
      .select("day_number, scheduled_date, credits, status, delivered_at")
      .eq("subscription_id", sub.id)
      .order("day_number", { ascending: true });
    deliveries = (rows ?? []) as typeof deliveries;
  }
  const { data: tutorials } = await db
    .from("recharge_plan_tutorial_media")
    .select("slug,title,description,media_url,media_type")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return {
    id: sub.id,
    token: sub.order_token,
    status: sub.status,
    customer_name: sub.customer_name,
    workspace_name: sub.workspace_name,
    owner_email_required: sub.owner_email_required,
    owner_email_added_at: sub.owner_email_added_at,
    duration_days: sub.duration_days,
    credits_per_day: sub.credits_per_day,
    total_credits_cap: sub.total_credits_cap,
    delivery_hour: sub.delivery_hour,
    sale_price_cents: sub.sale_price_cents,
    started_at: sub.started_at,
    ends_at: sub.ends_at,
    awaiting_owner_expires_at: sub.awaiting_owner_expires_at,
    cancelled_at: sub.cancelled_at,
    cancelled_reason: sub.cancelled_reason,
    completed_at: sub.completed_at,
    owner_rejected_at: sub.owner_rejected_at,
    owner_rejected_reason: sub.owner_rejected_reason,
    owner_rejected_count: sub.owner_rejected_count ?? 0,
    owner_confirmation_attempts: sub.owner_confirmation_attempts ?? 0,
    plan,
    deliveries,
    tutorials: tutorials ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "get";
    const token = url.searchParams.get("token") ?? "";
    if (!TOKEN_RE.test(token)) return json({ error: "token inválido" }, 400);

    const db = admin();
    const sub = await getSubByToken(db, token);
    if (!sub) return json({ error: "Pedido não encontrado" }, 404);

    if (action === "get") {
      return json({ data: await buildPayload(db, sub) });
    }

    if (action === "set_workspace") {
      if (sub.status !== "awaiting_owner") {
        return json({ error: "Este pedido não está mais aguardando configuração" }, 400);
      }
      let workspace_name = "";
      try {
        const body = await req.json();
        workspace_name = String(body?.workspace_name ?? "").trim();
      } catch { /* ignore */ }
      if (!workspace_name) return json({ error: "Informe o nome do workspace" }, 400);
      if (workspace_name.length > 120) return json({ error: "Nome muito longo" }, 400);

      const { error } = await db
        .from("reseller_recharge_plan_subscriptions")
        .update({
          workspace_name,
          owner_email_added_at: new Date().toISOString(),
          status: "awaiting_confirm",
          owner_confirmation_attempts: (sub.owner_confirmation_attempts ?? 0) + 1,
        })
        .eq("id", sub.id);
      if (error) return json({ error: error.message }, 500);
      const fresh = await getSubByToken(db, token);
      return json({ data: await buildPayload(db, fresh!) });
    }

    if (action === "confirm_start") {
      // Mantido apenas para compatibilidade — o início agora é manual pelo gerente.
      return json({ error: "Aguarde a verificação manual do gerente para iniciar as entregas." }, 400);
    }

    if (action === "resubmit_owner") {
      if (sub.status !== "owner_rejected") {
        return json({ error: "Este pedido não está em estado de rejeição" }, 400);
      }
      const { error } = await db
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "awaiting_confirm",
          owner_email_added_at: new Date().toISOString(),
          owner_confirmation_attempts: (sub.owner_confirmation_attempts ?? 0) + 1,
        })
        .eq("id", sub.id)
        .eq("status", "owner_rejected");
      if (error) return json({ error: error.message }, 500);
      const fresh = await getSubByToken(db, token);
      return json({ data: await buildPayload(db, fresh!) });
    }

    if (action === "cancel") {
      if (
        sub.status !== "awaiting_owner" &&
        sub.status !== "awaiting_confirm" &&
        sub.status !== "owner_rejected"
      ) {
        return json({ error: "Não é mais possível cancelar este pedido" }, 400);
      }
      let reason = "Cancelado pelo cliente";
      try {
        const body = await req.json();
        if (body?.reason) reason = String(body.reason).slice(0, 200);
      } catch { /* ignore */ }
      const { error } = await db
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason,
        })
        .eq("id", sub.id);
      if (error) return json({ error: error.message }, 500);
      const fresh = await getSubByToken(db, token);
      return json({ data: await buildPayload(db, fresh!) });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "erro" }, 500);
  }
});