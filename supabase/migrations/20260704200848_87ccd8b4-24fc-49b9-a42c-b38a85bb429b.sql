
-- 1) claude_plan_prices: hide internal costs from clients (managers use SECURITY DEFINER RPC admin_claude_plan_prices_full)
REVOKE SELECT (cost_cents, reseller_cost_cents) ON public.claude_plan_prices FROM authenticated, anon;

-- 2) orders / storefront_orders / claude_orders: hide raw PIX provider payloads
REVOKE SELECT (provider_response) ON public.orders FROM authenticated, anon;
REVOKE SELECT (provider_response) ON public.claude_orders FROM authenticated, anon;
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated, anon;

-- 3) reseller_integrations: hide credential columns from client SELECTs (accessed via dedicated edge functions)
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key) ON public.reseller_integrations FROM authenticated, anon;

-- 4) reseller_recharge_plan_prices: hide platform cost_cents from anon storefront and reseller selects
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM authenticated, anon;
