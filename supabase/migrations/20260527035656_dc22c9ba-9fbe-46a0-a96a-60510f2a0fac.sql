CREATE OR REPLACE FUNCTION public.get_credit_pack_cost(_reseller_id uuid, _plan_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tier public.reseller_tiers;
  _cost bigint;
  _ouro_id uuid := '4e670a7f-921c-4ca1-8792-8eac2b4905ef';
BEGIN
  -- Regra principal: nível do revendedor -> preço daquele nível para o pacote.
  SELECT * INTO _tier FROM public.get_reseller_tier(_reseller_id);

  IF _tier.id IS NOT NULL THEN
    SELECT price_cents INTO _cost
    FROM public.tier_credit_prices
    WHERE tier_id = _tier.id
      AND plan_id = _plan_id
      AND is_active = true
    LIMIT 1;

    IF _cost IS NOT NULL THEN
      RETURN _cost;
    END IF;
  END IF;

  -- Fallback de segurança: usa o preço do nível Ouro para não bloquear a venda.
  -- Em caso de divergência, o gerente faz estorno manual.
  SELECT price_cents INTO _cost
  FROM public.tier_credit_prices
  WHERE tier_id = _ouro_id
    AND plan_id = _plan_id
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(_cost, 0);
END;
$function$;