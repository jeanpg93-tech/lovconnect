
-- 1) claude_plan_prices: remove public policy (public reads must use the view)
DROP POLICY IF EXISTS "Public can view active claude plan prices" ON public.claude_plan_prices;

-- 2) reseller_recharge_plan_prices: column-level revoke for anon (hide cost_cents)
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM anon;
GRANT SELECT (id, reseller_id, plan_id, sale_price_cents, is_active, show_on_storefront, created_at, updated_at)
  ON public.reseller_recharge_plan_prices TO anon;

-- 3) resellers: remove broad public policy; keep own + gerente. Recreate a
--    security-definer version of resellers_public so anon/authenticated cross-reseller
--    reads still work for the safe columns only.
DROP POLICY IF EXISTS "Public can view active reseller basics" ON public.resellers;

DROP VIEW IF EXISTS public.resellers_public;
CREATE VIEW public.resellers_public
WITH (security_invoker = off)
AS
  SELECT id, display_name, slug, is_active
  FROM public.resellers
  WHERE is_active = true;
GRANT SELECT ON public.resellers_public TO anon, authenticated;

-- 4) pricing_plans: restrict base-table SELECT to gerente. Non-gerente users
--    read from a new view that omits cost/markup.
DROP POLICY IF EXISTS "Autenticados veem planos ativos" ON public.pricing_plans;
CREATE POLICY "Gerente vê planos"
  ON public.pricing_plans FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE OR REPLACE VIEW public.pricing_plans_public
WITH (security_invoker = off)
AS
  SELECT id, license_type, label, price_cents, customer_price_cents, min_price_cents, is_active, created_at, updated_at
  FROM public.pricing_plans
  WHERE is_active = true;
GRANT SELECT ON public.pricing_plans_public TO anon, authenticated;

-- 5) reseller_claude_api_keys: drop plaintext key column
ALTER TABLE public.reseller_claude_api_keys DROP COLUMN IF EXISTS key_full;
