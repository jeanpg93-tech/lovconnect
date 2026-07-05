
-- Fase 1: Promoção Claude com desconto por nível

-- 1) Coluna nova em promotions (aditiva, opcional)
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS claude_discount_by_tier jsonb;

-- Validação: se presente, deve ser objeto com valores numéricos 0..100
CREATE OR REPLACE FUNCTION public.validate_claude_discount_by_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _k text;
  _v numeric;
BEGIN
  IF NEW.claude_discount_by_tier IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.claude_discount_by_tier) <> 'object' THEN
    RAISE EXCEPTION 'claude_discount_by_tier deve ser um objeto jsonb';
  END IF;
  FOR _k, _v IN
    SELECT key, (value)::text::numeric FROM jsonb_each_text(NEW.claude_discount_by_tier)
  LOOP
    IF _v < 0 OR _v > 100 THEN
      RAISE EXCEPTION 'Desconto para tier % deve estar entre 0 e 100 (recebido: %)', _k, _v;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_claude_discount_by_tier ON public.promotions;
CREATE TRIGGER trg_validate_claude_discount_by_tier
BEFORE INSERT OR UPDATE OF claude_discount_by_tier ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.validate_claude_discount_by_tier();

-- 2) Função auxiliar: retorna a promoção Claude ativa (se houver)
CREATE OR REPLACE FUNCTION public.get_active_claude_promotion()
RETURNS TABLE (
  id uuid,
  name text,
  claude_discount_by_tier jsonb,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.claude_discount_by_tier, p.starts_at, p.ends_at
  FROM public.promotions p
  WHERE p.status = 'active'
    AND p.claude_discount_by_tier IS NOT NULL
    AND (p.starts_at IS NULL OR p.starts_at <= now())
    AND (p.ends_at   IS NULL OR p.ends_at   >= now())
  ORDER BY p.activated_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_claude_promotion() TO authenticated, anon;

-- 3) Atualizar get_reseller_claude_cost para aplicar desconto quando promoção ativa
CREATE OR REPLACE FUNCTION public.get_reseller_claude_cost(_reseller_id uuid, _plan_code text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
  -- Custo base (mesma lógica de antes)
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);
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

  -- Se não temos tier, não há como aplicar desconto por nível
  IF _tier.id IS NULL OR _tier.slug IS NULL THEN
    RETURN COALESCE(_base, 0);
  END IF;

  -- Verifica promoção ativa
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
