
CREATE TABLE IF NOT EXISTS public.tier_claude_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  reseller_cost_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, plan_code)
);

GRANT SELECT ON public.tier_claude_prices TO authenticated;
GRANT ALL ON public.tier_claude_prices TO service_role;
ALTER TABLE public.tier_claude_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage tier_claude_prices"
ON public.tier_claude_prices FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gerente'))
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "authenticated read tier_claude_prices"
ON public.tier_claude_prices FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_tier_claude_prices()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tier_claude_prices_updated_at ON public.tier_claude_prices;
CREATE TRIGGER trg_tier_claude_prices_updated_at
BEFORE UPDATE ON public.tier_claude_prices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_tier_claude_prices();

CREATE OR REPLACE FUNCTION public.get_reseller_claude_cost(_reseller_id uuid, _plan_code text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tier public.reseller_tiers;
  _cents integer;
  _default integer;
BEGIN
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);
  IF _tier.id IS NOT NULL THEN
    SELECT reseller_cost_cents INTO _cents
    FROM public.tier_claude_prices
    WHERE tier_id = _tier.id AND plan_code = _plan_code AND is_active = true
    LIMIT 1;
    IF _cents IS NOT NULL THEN RETURN _cents; END IF;
  END IF;
  SELECT COALESCE(reseller_cost_cents, sale_price_cents) INTO _default
  FROM public.claude_plan_prices WHERE plan_code = _plan_code LIMIT 1;
  RETURN COALESCE(_default, 0);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_reseller_claude_cost(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_tier_claude_prices_matrix()
RETURNS TABLE (
  tier_id uuid,
  tier_name text,
  tier_sort_order integer,
  plan_code text,
  reseller_cost_cents integer,
  is_active boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, t.sort_order, p.plan_code,
         COALESCE(tcp.reseller_cost_cents, p.reseller_cost_cents, 0),
         COALESCE(tcp.is_active, true)
  FROM public.reseller_tiers t
  CROSS JOIN public.claude_plan_prices p
  LEFT JOIN public.tier_claude_prices tcp
    ON tcp.tier_id = t.id AND tcp.plan_code = p.plan_code
  WHERE t.is_active = true
  ORDER BY t.sort_order, p.plan_code;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_tier_claude_prices_matrix() TO authenticated, service_role;
