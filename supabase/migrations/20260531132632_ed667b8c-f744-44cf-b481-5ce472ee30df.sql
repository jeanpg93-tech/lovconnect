-- 1) Novas colunas em promotions
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS activation_promote_to_tier_id uuid
    REFERENCES public.reseller_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activation_referral_extra_pct numeric(5,2);

ALTER TABLE public.promotions
  DROP CONSTRAINT IF EXISTS promotions_activation_referral_extra_range;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_activation_referral_extra_range
    CHECK (activation_referral_extra_pct IS NULL
           OR (activation_referral_extra_pct >= 0 AND activation_referral_extra_pct <= 100));

-- Inclui as novas opcoes no check "tem algum valor"
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_has_value;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_has_value CHECK (
  extension_discount_pct IS NOT NULL
  OR credit_discount_pct IS NOT NULL
  OR recharge_bonus_pct IS NOT NULL
  OR activation_discount_pct IS NOT NULL
  OR activation_discount_cents IS NOT NULL
  OR activation_fixed_price_cents IS NOT NULL
  OR activation_bonus_cents IS NOT NULL
  OR activation_promote_to_tier_id IS NOT NULL
  OR activation_referral_extra_pct IS NOT NULL
);

-- 2) Atualiza activate_reseller para aplicar nivel minimo + comissao de indicacao
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
  _amount         bigint;
  _bonus          bigint;
  _promotion_id   uuid;
  _promote_tier   uuid;
  _extra_pct      numeric(5,2);
  _referrer       record;
  _tier_row       record;
  _base_pct       numeric;
  _total_pct      numeric;
  _commission     bigint;
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
    SELECT amount_cents, COALESCE(bonus_cents, 0), promotion_id
      INTO _amount, _bonus, _promotion_id
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

    -- Promocao: aplica nivel inicial + paga comissao extra de indicacao
    IF _promotion_id IS NOT NULL THEN
      SELECT activation_promote_to_tier_id, activation_referral_extra_pct
        INTO _promote_tier, _extra_pct
        FROM public.promotions
       WHERE id = _promotion_id;

      -- Aplica piso de nivel (sem mexer em progressao de gasto)
      IF _promote_tier IS NOT NULL THEN
        UPDATE public.resellers
           SET bonus_min_tier_id = _promote_tier,
               updated_at = now()
         WHERE id = _reseller_id;
      END IF;

      -- Comissao de indicacao sobre o valor pago da adesao
      IF _amount IS NOT NULL AND _amount > 0 THEN
        SELECT id, referrer_reseller_id
          INTO _referrer
          FROM public.reseller_referrals
         WHERE referred_reseller_id = _reseller_id
         LIMIT 1;

        IF _referrer.referrer_reseller_id IS NOT NULL THEN
          SELECT *
            INTO _tier_row
            FROM public.get_reseller_tier(_referrer.referrer_reseller_id)
            LIMIT 1;

          _base_pct  := COALESCE(_tier_row.referral_commission_percent, 0);
          _total_pct := _base_pct + COALESCE(_extra_pct, 0);

          IF _total_pct > 0 THEN
            _commission := floor((_amount * _total_pct) / 100)::bigint;
            IF _commission > 0 THEN
              PERFORM public.credit_reseller_balance(
                _referrer.referrer_reseller_id,
                _commission,
                'referral_commission',
                'Comissão de indicação — adesão (' || _total_pct::text || '% sobre R$ '
                  || to_char((_amount::numeric / 100), 'FM999990.00') || ')',
                _payment_id
              );
              PERFORM public.add_referral_commission(_referrer.id, _commission);
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_reseller(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_reseller(uuid, uuid, uuid) TO authenticated, service_role;