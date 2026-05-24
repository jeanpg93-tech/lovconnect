-- Bônus único: revendedores ativos não-partner cadastrados até agora começam em Prata
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS bonus_min_tier_id uuid REFERENCES public.reseller_tiers(id) ON DELETE SET NULL;

-- Aplica o bônus aos ativos atuais que NÃO são Partner forçado
UPDATE public.resellers r
SET bonus_min_tier_id = '5f18be43-43c7-45d6-b857-16c4d9b40fbd' -- Prata
WHERE r.is_active = true
  AND r.bonus_min_tier_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.reseller_tier_state s
    WHERE s.reseller_id = r.id
      AND s.forced_tier_id = '2b252b67-789f-4156-9bbd-98e04cdd7006' -- Partner
  );

-- Atualiza get_reseller_tier para considerar o bônus como piso mínimo
CREATE OR REPLACE FUNCTION public.get_reseller_tier(_reseller_id uuid)
 RETURNS reseller_tiers
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _state RECORD;
  _tier public.reseller_tiers;
  _bonus_tier_id uuid;
  _bonus_tier public.reseller_tiers;
BEGIN
  SELECT * INTO _state FROM public.reseller_tier_state WHERE reseller_id = _reseller_id;

  -- Forced tier (ex.: Partner) sempre tem prioridade máxima
  IF _state.forced_tier_id IS NOT NULL THEN
    SELECT * INTO _tier FROM public.reseller_tiers WHERE id = _state.forced_tier_id AND is_active = true;
    IF FOUND THEN RETURN _tier; END IF;
  END IF;

  -- Tier calculado pelo gasto
  SELECT * INTO _tier FROM public.reseller_tiers
    WHERE is_active = true AND min_spent_cents <= COALESCE(_state.total_spent_cents, 0)
    ORDER BY min_spent_cents DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO _tier FROM public.reseller_tiers WHERE is_active = true ORDER BY min_spent_cents ASC LIMIT 1;
  END IF;

  -- Aplica o bônus como piso mínimo (max entre calculado e bônus)
  SELECT bonus_min_tier_id INTO _bonus_tier_id FROM public.resellers WHERE id = _reseller_id;
  IF _bonus_tier_id IS NOT NULL THEN
    SELECT * INTO _bonus_tier FROM public.reseller_tiers WHERE id = _bonus_tier_id AND is_active = true;
    IF FOUND AND _bonus_tier.sort_order > COALESCE(_tier.sort_order, -1) THEN
      RETURN _bonus_tier;
    END IF;
  END IF;

  RETURN _tier;
END;
$function$;