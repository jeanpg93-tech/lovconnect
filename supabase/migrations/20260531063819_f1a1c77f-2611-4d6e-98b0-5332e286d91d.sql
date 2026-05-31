-- 1) Novas colunas em promotions
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS activation_discount_pct      numeric(5,2),
  ADD COLUMN IF NOT EXISTS activation_discount_cents    bigint,
  ADD COLUMN IF NOT EXISTS activation_fixed_price_cents bigint,
  ADD COLUMN IF NOT EXISTS activation_bonus_cents       bigint;

ALTER TABLE public.promotions
  DROP CONSTRAINT IF EXISTS promotions_activation_single_mode;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_activation_single_mode CHECK (
    (
      (CASE WHEN activation_discount_pct      IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN activation_discount_cents    IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN activation_fixed_price_cents IS NOT NULL THEN 1 ELSE 0 END)
    ) <= 1
  );

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_has_value;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_has_value CHECK (
  extension_discount_pct       IS NOT NULL OR
  credit_discount_pct          IS NOT NULL OR
  recharge_bonus_pct           IS NOT NULL OR
  activation_discount_pct      IS NOT NULL OR
  activation_discount_cents    IS NOT NULL OR
  activation_fixed_price_cents IS NOT NULL OR
  activation_bonus_cents       IS NOT NULL
);

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_activation_pct_range;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_activation_pct_range CHECK (
  activation_discount_pct IS NULL OR (activation_discount_pct >= 0 AND activation_discount_pct <= 100)
);

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_activation_amounts_nonneg;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_activation_amounts_nonneg CHECK (
  (activation_discount_cents    IS NULL OR activation_discount_cents    >= 0) AND
  (activation_fixed_price_cents IS NULL OR activation_fixed_price_cents >= 0) AND
  (activation_bonus_cents       IS NULL OR activation_bonus_cents       >= 0)
);

-- 2) Rastreio em activation_payments
ALTER TABLE public.activation_payments
  ADD COLUMN IF NOT EXISTS promotion_id          uuid REFERENCES public.promotions(id),
  ADD COLUMN IF NOT EXISTS original_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS bonus_cents           bigint NOT NULL DEFAULT 0;

-- 3) RPC pra calcular pricing da adesão
CREATE OR REPLACE FUNCTION public.compute_activation_pricing(_base_cents bigint)
RETURNS TABLE(
  final_price_cents    bigint,
  bonus_cents          bigint,
  balance_credit_cents bigint,
  promotion_id         uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _promo public.promotions%ROWTYPE;
  _final bigint := COALESCE(_base_cents, 0);
  _bonus bigint := 0;
BEGIN
  IF _base_cents IS NULL OR _base_cents <= 0 THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO _promo
  FROM public.promotions
  WHERE status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  ORDER BY activated_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    IF _promo.activation_fixed_price_cents IS NOT NULL THEN
      _final := _promo.activation_fixed_price_cents;
    ELSIF _promo.activation_discount_pct IS NOT NULL THEN
      _final := GREATEST(0, _base_cents - ROUND(_base_cents * _promo.activation_discount_pct / 100.0)::bigint);
    ELSIF _promo.activation_discount_cents IS NOT NULL THEN
      _final := GREATEST(0, _base_cents - _promo.activation_discount_cents);
    END IF;

    _bonus := COALESCE(_promo.activation_bonus_cents, 0);

    IF _final <> _base_cents OR _bonus > 0 THEN
      RETURN QUERY SELECT _final, _bonus, (_final + _bonus), _promo.id;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT _final, 0::bigint, _final, NULL::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_activation_pricing(bigint) TO anon, authenticated, service_role;

-- 4) Recriar activate_reseller (preservando defaults dos parametros)
DROP FUNCTION IF EXISTS public.activate_reseller(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.activate_reseller(
  _reseller_id uuid,
  _payment_id  uuid DEFAULT NULL,
  _actor_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amount bigint;
  _bonus  bigint;
BEGIN
  IF _payment_id IS NOT NULL THEN
    UPDATE public.activation_payments
       SET status = 'approved',
           reviewed_by = _actor_id,
           reviewed_at = now()
     WHERE id = _payment_id;
  END IF;

  UPDATE public.resellers
     SET activation_status = 'active',
         is_active = true
   WHERE id = _reseller_id;

  IF _payment_id IS NOT NULL THEN
    SELECT amount_cents, COALESCE(bonus_cents, 0)
      INTO _amount, _bonus
      FROM public.activation_payments
     WHERE id = _payment_id;

    IF _amount IS NOT NULL AND _amount > 0 THEN
      PERFORM public.credit_reseller_balance(
        _reseller_id, _amount, 'activation_credit',
        'Saldo inicial — pagamento de ativação do painel', _payment_id
      );
    END IF;

    IF _bonus IS NOT NULL AND _bonus > 0 THEN
      PERFORM public.credit_reseller_balance(
        _reseller_id, _bonus, 'activation_bonus',
        'Bônus promocional de adesão', _payment_id
      );
    END IF;
  END IF;
END;
$$;