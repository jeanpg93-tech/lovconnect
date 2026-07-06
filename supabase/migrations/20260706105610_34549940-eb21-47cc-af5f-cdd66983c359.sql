
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS claude_tier_override_id uuid REFERENCES public.reseller_tiers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_reseller_claude_tier(_reseller_id uuid)
RETURNS public.reseller_tiers
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _override_id uuid;
  _tier public.reseller_tiers;
BEGIN
  SELECT claude_tier_override_id INTO _override_id FROM public.resellers WHERE id = _reseller_id;
  IF _override_id IS NOT NULL THEN
    SELECT * INTO _tier FROM public.reseller_tiers WHERE id = _override_id AND is_active = true;
    IF FOUND THEN RETURN _tier; END IF;
  END IF;
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);
  RETURN _tier;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reseller_claude_cost(_reseller_id uuid, _plan_code text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tier public.reseller_tiers;
  _cents integer;
  _default integer;
  _base integer;
  _promo record;
  _pct numeric;
  _discounted integer;
BEGIN
  SELECT * INTO _tier FROM public.get_reseller_claude_tier(_reseller_id);
  IF _tier.id IS NOT NULL THEN
    SELECT reseller_cost_cents INTO _cents
    FROM public.tier_claude_prices
    WHERE tier_id = _tier.id AND plan_code = _plan_code AND is_active = true
    LIMIT 1;
    _base := _cents;
  END IF;

  IF _base IS NULL THEN
    SELECT COALESCE(reseller_cost_cents, sale_price_cents) INTO _default
    FROM public.claude_plan_prices WHERE plan_code = _plan_code LIMIT 1;
    _base := COALESCE(_default, 0);
  END IF;

  IF _tier.id IS NULL OR _tier.slug IS NULL THEN
    RETURN COALESCE(_base, 0);
  END IF;

  SELECT * INTO _promo FROM public.get_active_claude_promotion();
  IF NOT FOUND OR _promo.claude_discount_by_tier IS NULL THEN
    RETURN COALESCE(_base, 0);
  END IF;

  _pct := NULLIF(_promo.claude_discount_by_tier ->> _tier.slug, '')::numeric;
  IF _pct IS NULL OR _pct <= 0 THEN
    RETURN COALESCE(_base, 0);
  END IF;

  _discounted := FLOOR(_base * (100 - _pct) / 100.0)::integer;
  IF _discounted < 0 THEN _discounted := 0; END IF;
  RETURN _discounted;
END;
$$;
