
-- 1) global_settings: restrict SELECT to gerente only
DROP POLICY IF EXISTS "Authenticated can view global settings" ON public.global_settings;
CREATE POLICY "Only managers can view global settings"
  ON public.global_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

-- 2) Convert SECURITY DEFINER views to SECURITY INVOKER
ALTER VIEW public.resellers_public SET (security_invoker = on);
ALTER VIEW public.claude_plan_prices_public SET (security_invoker = on);

-- 2a) resellers: allow anon + authenticated to see only the public columns
--     of active resellers. Sensitive columns are blocked via column-level GRANTs.
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO authenticated;

DROP POLICY IF EXISTS "Public can view active reseller basics" ON public.resellers;
CREATE POLICY "Public can view active reseller basics"
  ON public.resellers
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- 2b) claude_plan_prices: allow anon + authenticated to read only public
--     pricing columns of active plans. Cost columns stay restricted.
GRANT SELECT (id, plan_code, sale_price_cents, is_active, sort_order, created_at, updated_at)
  ON public.claude_plan_prices TO anon;
GRANT SELECT (id, plan_code, sale_price_cents, is_active, sort_order, created_at, updated_at)
  ON public.claude_plan_prices TO authenticated;

DROP POLICY IF EXISTS "Public can view active claude plan prices" ON public.claude_plan_prices;
CREATE POLICY "Public can view active claude plan prices"
  ON public.claude_plan_prices
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
