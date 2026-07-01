
-- 1) SECURITY DEFINER view -> security_invoker
ALTER VIEW public.reseller_recharge_plan_subscriptions_admin SET (security_invoker = true);

-- 2) claude_plan_prices: hide cost columns from resellers (authenticated)
REVOKE SELECT (cost_cents, reseller_cost_cents) ON public.claude_plan_prices FROM authenticated;
REVOKE SELECT (cost_cents, reseller_cost_cents) ON public.claude_plan_prices FROM anon;
-- service_role and RPCs (SECURITY DEFINER) retain access

-- 3) reseller_recharge_plan_prices: hide cost from public/anon
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM anon;

-- 4) global_settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view global settings" ON public.global_settings;
CREATE POLICY "Authenticated can view global settings"
  ON public.global_settings
  FOR SELECT
  TO authenticated
  USING (true);
