
CREATE TABLE IF NOT EXISTS public.reseller_credit_cost_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  credits_amount integer NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, credits_amount)
);

CREATE INDEX IF NOT EXISTS idx_reseller_credit_cost_overrides_lookup
  ON public.reseller_credit_cost_overrides (reseller_id, credits_amount)
  WHERE is_active = true;

ALTER TABLE public.reseller_credit_cost_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia credit cost overrides"
  ON public.reseller_credit_cost_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Revendedor vê seus credit cost overrides"
  ON public.reseller_credit_cost_overrides FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER set_updated_at_reseller_credit_cost_overrides
  BEFORE UPDATE ON public.reseller_credit_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atualiza get_credit_pack_cost: usar overrides de CUSTO (não a tabela de venda),
-- com fallback Partner -> Ouro
CREATE OR REPLACE FUNCTION public.get_credit_pack_cost(_reseller_id uuid, _plan_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _credits int;
  _cost bigint;
  _tier public.reseller_tiers;
  _ouro_id uuid;
  _is_partner boolean;
BEGIN
  SELECT credits_amount INTO _credits FROM public.credit_pricing_plans WHERE id = _plan_id;
  IF _credits IS NULL THEN RETURN 0; END IF;

  -- 1) Override de CUSTO individual (definido pelo gerente)
  SELECT price_cents INTO _cost
  FROM public.reseller_credit_cost_overrides
  WHERE reseller_id = _reseller_id
    AND credits_amount = _credits
    AND COALESCE(is_active, true) = true
  LIMIT 1;
  IF _cost IS NOT NULL AND _cost > 0 THEN RETURN _cost; END IF;

  -- 2) Preço fixo do tier do revendedor
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);
  IF _tier.id IS NOT NULL THEN
    SELECT price_cents INTO _cost
    FROM public.tier_credit_prices
    WHERE tier_id = _tier.id AND plan_id = _plan_id AND is_active = true
    LIMIT 1;
    IF _cost IS NOT NULL AND _cost > 0 THEN RETURN _cost; END IF;

    -- 3) Fallback Partner -> Ouro
    _is_partner := (_tier.is_hidden = true)
                OR (lower(coalesce(_tier.slug,'')) = 'partner')
                OR (lower(coalesce(_tier.name,'')) LIKE '%partner%');
    IF _is_partner THEN
      SELECT id INTO _ouro_id FROM public.reseller_tiers
        WHERE is_active = true AND (lower(slug) = 'ouro' OR lower(name) LIKE '%ouro%')
        ORDER BY sort_order LIMIT 1;
      IF _ouro_id IS NOT NULL THEN
        SELECT price_cents INTO _cost
        FROM public.tier_credit_prices
        WHERE tier_id = _ouro_id AND plan_id = _plan_id AND is_active = true
        LIMIT 1;
        IF _cost IS NOT NULL AND _cost > 0 THEN RETURN _cost; END IF;
      END IF;
    END IF;
  END IF;

  -- 4) Preço base do pacote
  SELECT price_cents INTO _cost FROM public.credit_pricing_plans WHERE id = _plan_id;
  RETURN COALESCE(_cost, 0);
END;
$function$;
