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

    const body = await req.json().catch(() => ({}));
    const planId = String(body.plan_id ?? "").trim();
    const customerName = String(body.customer_name ?? "").trim();
    const customerWhatsapp = body.customer_whatsapp
      ? String(body.customer_whatsapp).trim()
      : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!planId) return json({ error: "missing_plan" }, 400);
    if (customerName.length < 2) return json({ error: "invalid_name" }, 400);

    // Resolve reseller_id do usuário
    const { data: reseller } = await admin
      .from("resellers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "reseller_not_found" }, 403);
    const resellerId = reseller.id;

    const { data: plan } = await admin
      .from("recharge_plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (!plan) return json({ error: "plan_not_found" }, 404);
    if (!plan.is_active) return json({ error: "plan_inactive" }, 400);
    if (!plan.bot_owner_email) return json({ error: "plan_not_ready" }, 400);

    const { data: price } = await admin
      .from("reseller_recharge_plan_prices")
      .select("sale_price_cents, is_active")
      .eq("reseller_id", resellerId)
      .eq("plan_id", planId)
      .maybeSingle();
    if (!price) return json({ error: "sale_price_missing" }, 400);
    if (!price.is_active) return json({ error: "plan_disabled" }, 400);
    if (!price.sale_price_cents || price.sale_price_cents <= 0) {
      return json({ error: "sale_price_missing" }, 400);
    }

    const costCents = Number(plan.base_cost_cents);
    const saleCents = Number(price.sale_price_cents);

    // Debita do saldo
    const { data: debited, error: debitErr } = await admin.rpc("debit_reseller_balance", {
      _reseller_id: resellerId,
      _amount_cents: costCents,
      _kind: "recharge_plan_manual",
      _description: `Venda manual do plano "${plan.name}"`,
      _reference_id: null,
    });
    if (debitErr) return json({ error: "debit_failed", detail: debitErr.message }, 500);
    if (debited === false) return json({ error: "insufficient_balance" }, 400);

    const { data: sub, error: insErr } = await admin
      .from("reseller_recharge_plan_subscriptions")
      .insert({
        reseller_id: resellerId,
        plan_id: plan.id,
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        owner_email_required: plan.bot_owner_email,
        source: "manual",
        cost_cents: costCents,
        sale_price_cents: saleCents,
        duration_days: plan.duration_days,
        credits_per_day: plan.credits_per_day,
        total_credits_cap: plan.total_credits_cap,
        delivery_hour: plan.delivery_hour,
        notes,
      })
      .select("id, order_token")
      .single();

    if (insErr || !sub) {
      await admin.rpc("credit_reseller_balance", {
        _reseller_id: resellerId,
        _amount_cents: costCents,
        _kind: "recharge_plan_refund",
        _description: `Estorno (falha ao criar venda manual)`,
        _reference_id: null,
      });
      return json({ error: "create_failed", detail: insErr?.message }, 500);
    }

    return json({ ok: true, order_token: sub.order_token, id: sub.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});