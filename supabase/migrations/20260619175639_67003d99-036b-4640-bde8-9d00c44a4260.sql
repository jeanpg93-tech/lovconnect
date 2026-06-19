
-- 1) recharge_plans: restrict direct SELECT to gerente only
DROP POLICY IF EXISTS "recharge_plans_select_authenticated" ON public.recharge_plans;
CREATE POLICY "recharge_plans_select_gerente"
ON public.recharge_plans FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

-- Public RPC returning only safe columns of active plans (used by PublicStorefront)
CREATE OR REPLACE FUNCTION public.public_list_active_recharge_plans()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  duration_days integer,
  credits_per_day integer,
  total_credits_cap integer,
  delivery_hour integer,
  is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, description, duration_days, credits_per_day,
         total_credits_cap, delivery_hour, is_active
  FROM public.recharge_plans
  WHERE is_active = true
$$;
REVOKE ALL ON FUNCTION public.public_list_active_recharge_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_active_recharge_plans() TO anon, authenticated;

-- Strip bot_owner_email from reseller-facing RPC
CREATE OR REPLACE FUNCTION public.reseller_list_recharge_plans()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  duration_days integer,
  credits_per_day integer,
  total_credits_cap integer,
  delivery_hour integer,
  is_active boolean,
  base_cost_cents bigint,
  bot_owner_email text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.name, p.description, p.duration_days, p.credits_per_day,
    p.total_credits_cap, p.delivery_hour, p.is_active,
    p.base_cost_cents,
    ''::text AS bot_owner_email,
    p.created_at, p.updated_at
  FROM public.recharge_plans p
  WHERE EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.user_id = auth.uid() AND r.is_active = true
  )
  ORDER BY p.created_at ASC;
$$;

-- 2) reseller_recharge_plan_prices: hide cost_cents from anon
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM anon;
GRANT SELECT (id, plan_id, reseller_id, sale_price_cents, is_active, show_on_storefront)
  ON public.reseller_recharge_plan_prices TO anon;

-- 3) pricing_plans: hide cost_cents / markup internals from authenticated (resellers)
--    Gerente continues reading full row via gerente_list_pricing_plans RPC.
REVOKE SELECT ON public.pricing_plans FROM authenticated;
GRANT SELECT (id, license_type, label, price_cents, customer_price_cents, min_price_cents, is_active)
  ON public.pricing_plans TO authenticated;

-- 4) resellers: restrict anon to display-safe columns
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, slug, display_name, is_active, recharge_plans_enabled)
  ON public.resellers TO anon;
