
-- claude_plan_prices: hide cost columns from anon/authenticated
REVOKE SELECT (cost_cents, reseller_cost_cents) ON public.claude_plan_prices FROM anon, authenticated;

-- pricing_plans: hide cost_cents
REVOKE SELECT (cost_cents) ON public.pricing_plans FROM anon, authenticated;

-- reseller_recharge_plan_prices: hide cost_cents from anon and authenticated
-- (owners access their own via a separate manager/service_role path; storefront only needs sale_price_cents)
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM anon, authenticated;
