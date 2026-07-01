
-- Hide sensitive columns from client roles via column-level REVOKE
-- Managers keep access via SECURITY DEFINER RPCs or admin views (created below where needed).

-- 1) claude_plan_prices: hide internal cost
REVOKE SELECT (cost_cents, reseller_cost_cents, reseller_cost_markup_bps, reseller_cost_mode) ON public.claude_plan_prices FROM anon, authenticated;

-- 2) orders.provider_response: hide provider payloads
REVOKE SELECT (provider_response) ON public.orders FROM anon, authenticated;

-- 3) pricing_plans.cost_cents: hide internal cost basis
REVOKE SELECT (cost_cents) ON public.pricing_plans FROM anon, authenticated;

-- 4) provider_credit_orders.email_convite_bot: hide bot invite email
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM anon, authenticated;

-- 5) reseller_integrations secrets: read-only through dedicated edge functions
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key) ON public.reseller_integrations FROM anon, authenticated;

-- 6) reseller_recharge_plan_prices.cost_cents: hide from anon and authenticated
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM anon, authenticated;

-- 7) reseller_recharge_plan_subscriptions.cost_cents: hide from client
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_subscriptions FROM anon, authenticated;

-- 8) storefront_orders.raw_response: hide PIX provider raw payload
REVOKE SELECT (raw_response) ON public.storefront_orders FROM anon, authenticated;

-- Admin view so gerentes can still read full rows (including cost_cents) for the
-- subscriptions table via a security-definer view.
CREATE OR REPLACE VIEW public.reseller_recharge_plan_subscriptions_admin AS
  SELECT s.*
  FROM public.reseller_recharge_plan_subscriptions s
  WHERE public.has_role(auth.uid(), 'gerente'::public.app_role);
GRANT SELECT ON public.reseller_recharge_plan_subscriptions_admin TO authenticated;
