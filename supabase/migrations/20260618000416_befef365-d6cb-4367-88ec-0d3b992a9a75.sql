GRANT SELECT (id, name, duration_days, credits_per_day, total_credits_cap, is_active) ON public.recharge_plans TO anon;
GRANT SELECT (reseller_id, plan_id, sale_price_cents, is_active, show_on_storefront) ON public.reseller_recharge_plan_prices TO anon;

DROP POLICY IF EXISTS "Public can view active recharge plans" ON public.recharge_plans;
CREATE POLICY "Public can view active recharge plans"
ON public.recharge_plans
FOR SELECT
TO anon
USING (is_active = true);

DROP POLICY IF EXISTS "Public can view visible reseller plan prices" ON public.reseller_recharge_plan_prices;
CREATE POLICY "Public can view visible reseller plan prices"
ON public.reseller_recharge_plan_prices
FOR SELECT
TO anon
USING (
  is_active = true
  AND show_on_storefront = true
  AND sale_price_cents > 0
  AND EXISTS (
    SELECT 1
    FROM public.resellers r
    JOIN public.reseller_storefronts s ON s.reseller_id = r.id
    WHERE r.id = reseller_recharge_plan_prices.reseller_id
      AND r.is_active = true
      AND s.is_enabled = true
      AND s.show_credits = true
  )
);