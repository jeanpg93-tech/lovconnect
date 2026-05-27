-- 1) Seed dos preços Partner (idempotente)
INSERT INTO public.tier_credit_prices (tier_id, plan_id, price_cents, is_active)
SELECT
  '2b252b67-789f-4156-9bbd-98e04cdd7006'::uuid AS tier_id,
  p.id AS plan_id,
  v.price_cents,
  true
FROM (VALUES
  (20,    305),
  (100,   935),
  (200,  1775),
  (300,  2615),
  (500,  3770),
  (1000, 7130),
  (2000,13115),
  (3000,18680),
  (5000,27290)
) AS v(credits_amount, price_cents)
JOIN public.credit_pricing_plans p
  ON p.credits_amount = v.credits_amount AND p.is_active = true
ON CONFLICT DO NOTHING;

-- Caso já existisse linha inativa/antiga, garante o valor correto e ativa
UPDATE public.tier_credit_prices t
SET price_cents = v.price_cents, is_active = true, updated_at = now()
FROM (VALUES
  (20,    305),
  (100,   935),
  (200,  1775),
  (300,  2615),
  (500,  3770),
  (1000, 7130),
  (2000,13115),
  (3000,18680),
  (5000,27290)
) AS v(credits_amount, price_cents)
JOIN public.credit_pricing_plans p
  ON p.credits_amount = v.credits_amount
WHERE t.tier_id = '2b252b67-789f-4156-9bbd-98e04cdd7006'::uuid
  AND t.plan_id = p.id;

-- 2) Reescreve get_credit_pack_cost com regra única
CREATE OR REPLACE FUNCTION public.get_credit_pack_cost(_reseller_id uuid, _plan_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tier public.reseller_tiers;
  _cost bigint;
BEGIN
  -- Regra única: nível do revendedor -> preço daquele nível para o pacote.
  -- Sem overrides individuais, sem fallback Partner->Ouro.
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);
  IF _tier.id IS NULL THEN RETURN 0; END IF;

  SELECT price_cents INTO _cost
  FROM public.tier_credit_prices
  WHERE tier_id = _tier.id
    AND plan_id = _plan_id
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(_cost, 0);
END;
$function$;