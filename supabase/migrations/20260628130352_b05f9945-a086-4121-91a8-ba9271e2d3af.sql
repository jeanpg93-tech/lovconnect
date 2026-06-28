
DROP FUNCTION IF EXISTS public.admin_claude_plan_prices_full();
CREATE OR REPLACE FUNCTION public.admin_claude_plan_prices_full()
RETURNS TABLE(
  id uuid, plan_code text, cost_cents integer,
  markup_mode text, markup_value_cents integer, sale_price_cents integer,
  reseller_cost_mode text, reseller_cost_markup_bps integer, reseller_cost_cents integer,
  is_active boolean, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.plan_code, p.cost_cents, p.markup_mode::text, p.markup_value_cents,
           p.sale_price_cents, p.reseller_cost_mode, p.reseller_cost_markup_bps, p.reseller_cost_cents,
           p.is_active, p.created_at, p.updated_at
      FROM public.claude_plan_prices p;
END;
$$;
