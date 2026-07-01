
-- Restore table-level SELECT that was inadvertently removed by column REVOKEs.
-- Postgres supports GRANT SELECT ON table + REVOKE SELECT(col) to hide specific columns.

-- 1) claude_plan_prices
GRANT SELECT ON public.claude_plan_prices TO authenticated;
REVOKE SELECT (cost_cents, reseller_cost_cents, reseller_cost_markup_bps, reseller_cost_mode) ON public.claude_plan_prices FROM authenticated;

-- 2) orders
GRANT SELECT ON public.orders TO authenticated;
REVOKE SELECT (provider_response) ON public.orders FROM authenticated;

-- 3) pricing_plans (also needs anon — used on public pages)
GRANT SELECT ON public.pricing_plans TO authenticated, anon;
REVOKE SELECT (cost_cents) ON public.pricing_plans FROM authenticated, anon;

-- 4) provider_credit_orders
GRANT SELECT ON public.provider_credit_orders TO authenticated;
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM authenticated;

-- 5) reseller_integrations
GRANT SELECT ON public.reseller_integrations TO authenticated;
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key) ON public.reseller_integrations FROM authenticated;

-- 6) reseller_recharge_plan_prices (public storefront reads these)
GRANT SELECT ON public.reseller_recharge_plan_prices TO authenticated, anon;
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM authenticated, anon;

-- 7) reseller_recharge_plan_subscriptions
GRANT SELECT ON public.reseller_recharge_plan_subscriptions TO authenticated;
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_subscriptions FROM authenticated;

-- 8) storefront_orders
GRANT SELECT ON public.storefront_orders TO authenticated;
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated;
