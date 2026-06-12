// Edge function de TESTE: libera/marca como pago um pedido PIX da loja pública
// EXCLUSIVAMENTE para o revendedor jean-carlo e para o plano de 3.000 créditos.
// Replica o fluxo do webhook MisticPay para product_type = 'recharge_plan'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_RESELLER_SLUG = "jean-carlo";
const ALLOWED_PLAN_TOTAL_CREDITS = 3000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { order_id } = await req.json().catch(() => ({}));
    if (!order_id) return json({ error: "order_id obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order } = await admin
      .from("storefront_orders")
      .select("id, status, reseller_id, product_type, recharge_plan_id, buyer_name, buyer_whatsapp, price_cents, cost_cents, short_code")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return json({ error: "Pedido não encontrado" }, 404);

    // Allow-list: somente jean-carlo
    const { data: reseller } = await admin
      .from("resellers")
      .select("id, slug")
      .eq("id", order.reseller_id)
      .maybeSingle();
    if (!reseller || reseller.slug !== ALLOWED_RESELLER_SLUG) {
      return json({ error: "Não autorizado" }, 403);
    }
    if (order.product_type !== "recharge_plan" || !order.recharge_plan_id) {
      return json({ error: "Pedido não é de plano de recarga" }, 400);
    }

    const { data: plan } = await admin
      .from("recharge_plans")
      .select("*")
      .eq("id", order.recharge_plan_id)
      .maybeSingle();
    if (!plan) return json({ error: "Plano não encontrado" }, 404);
    if (Number(plan.total_credits_cap) !== ALLOWED_PLAN_TOTAL_CREDITS) {
      return json({ error: "Plano não autorizado para liberação de teste" }, 403);
    }

    if (order.status === "completed" || order.status === "paid") {
      return json({ ok: true, already: true });
    }

    // Marca como pago
    await admin.from("storefront_orders").update({
      status: "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", order.id);

    const planCost = Number(order.cost_cents ?? 0);
    if (planCost > 0) {
      const { data: debitOk } = await admin.rpc("debit_reseller_balance", {
        _reseller_id: order.reseller_id,
        _amount_cents: planCost,
        _kind: "recharge_plan_storefront",
        _description: `[TESTE] Venda Loja: Plano ${plan.name}`,
        _reference_id: order.id,
      });
      if (debitOk === false) {
        await admin.from("storefront_orders").update({ status: "awaiting_balance" }).eq("id", order.id);
        await admin.from("pending_storefront_charges").insert({
          order_id: order.id,
          reseller_id: order.reseller_id,
          cost_cents: planCost,
          product_type: "recharge_plan",
        });
        return json({ ok: true, kind: "awaiting_balance" });
      }
      await admin.rpc("add_reseller_spent", {
        _reseller_id: order.reseller_id,
        _amount_cents: planCost,
      });
    }

    const { data: sub, error: subErr } = await admin
      .from("reseller_recharge_plan_subscriptions")
      .insert({
        reseller_id: order.reseller_id,
        plan_id: plan.id,
        customer_name: order.buyer_name,
        customer_whatsapp: order.buyer_whatsapp,
        owner_email_required: plan.bot_owner_email,
        source: "storefront",
        source_reference_id: order.id,
        cost_cents: planCost,
        sale_price_cents: Number(order.price_cents),
        duration_days: plan.duration_days,
        credits_per_day: plan.credits_per_day,
        total_credits_cap: plan.total_credits_cap,
        delivery_hour: plan.delivery_hour,
      })
      .select("id, order_token")
      .single();
    if (subErr || !sub) {
      return json({ error: subErr?.message ?? "Falha ao criar assinatura" }, 500);
    }

    const link = `/plano/${sub.order_token}`;
    await admin.from("storefront_orders").update({
      status: "completed",
      recharge_plan_subscription_id: sub.id,
      invite_link: link,
    }).eq("id", order.id);

    return json({ ok: true, order_token: sub.order_token, invite_link: link });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}