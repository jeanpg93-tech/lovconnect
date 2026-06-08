
-- =========================================================
-- Security hardening: restrict access to sensitive columns
-- =========================================================

-- 1) pricing_plans: hide cost_cents / markup_percent from clients.
--    Gerentes read full plans via SECURITY DEFINER RPC gerente_list_pricing_plans (already exists).
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon;

-- 2) reseller_integrations: hide payment + WhatsApp + provider API secrets
--    from direct Supabase client reads. Edge functions still access via service_role.
REVOKE SELECT (
  misticpay_client_id,
  misticpay_client_secret,
  evolution_api_key,
  lovable_credits_api_key
) ON public.reseller_integrations FROM authenticated;
REVOKE SELECT (
  misticpay_client_id,
  misticpay_client_secret,
  evolution_api_key,
  lovable_credits_api_key
) ON public.reseller_integrations FROM anon;

-- 3) resellers: anon must only see a tiny subset (storefront listing).
--    Replace broad anon SELECT with column-scoped privileges.
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active, recharge_plans_enabled)
  ON public.resellers TO anon;

-- 4) recharge_plans: stop exposing internal cost columns to anon.
--    Replace the public/all SELECT policy with an authenticated-only one,
--    then column-revoke the cost columns from authenticated as well so only
--    server-side (service_role) and the reseller's own pricing page (which
--    reads base_cost_cents in authenticated context) keep necessary access.
DROP POLICY IF EXISTS "recharge_plans_select_all" ON public.recharge_plans;

CREATE POLICY "recharge_plans_select_authenticated"
  ON public.recharge_plans
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon nothing (storefront uses an inner join through reseller_recharge_plan_prices
-- which is restricted by its own policy; service_role bypasses RLS for edge funcs).
-- Still revoke cost columns from anon defensively in case future policies are added.
REVOKE SELECT (base_cost_cents, platform_cost_cents) ON public.recharge_plans FROM anon;

-- platform_cost_cents is internal margin info — only gerentes need it.
-- Revoke from authenticated; gerentes will read it via a SECURITY DEFINER RPC.
REVOKE SELECT (platform_cost_cents) ON public.recharge_plans FROM authenticated;

CREATE OR REPLACE FUNCTION public.gerente_list_recharge_plans()
RETURNS SETOF public.recharge_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.recharge_plans ORDER BY duration_days, credits_per_day;
END;
$$;

REVOKE ALL ON FUNCTION public.gerente_list_recharge_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerente_list_recharge_plans() TO authenticated;

-- 5) reseller_*_cost_overrides: resellers don't need to see internal cost figures.
DROP POLICY IF EXISTS "Revendedor vê seus license cost overrides"
  ON public.reseller_license_cost_overrides;
DROP POLICY IF EXISTS "Revendedor vê seus credit cost overrides"
  ON public.reseller_credit_cost_overrides;
