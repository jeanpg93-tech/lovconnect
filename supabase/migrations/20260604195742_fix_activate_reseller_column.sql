-- Fix: a coluna real é reviewer_id (não reviewed_by). Mantém todo o resto da lógica.
CREATE OR REPLACE FUNCTION public.activate_reseller(_reseller_id uuid, _payment_id uuid DEFAULT NULL::uuid, _actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _amount             bigint;
  _bonus_paid         bigint;
  _stored_promo_id    uuid;
  _effective_promo_id uuid;
  _promote_tier       uuid;
  _extra_pct          numeric(5,2);
  _bonus_cents_promo  bigint;
  _bonus_extra        bigint := 0;
  _referrer           record;
  _tier_row           record;
  _base_pct           numeric;
  _total_pct          numeric;
  _commission         bigint;
BEGIN
  IF _payment_id IS NOT NULL THEN
    UPDATE public.activation_payments
       SET status = 'approved',
           reviewer_id = _actor_id,
           reviewed_at = now()
     WHERE id = _payment_id;
  END IF;

  UPDATE public.resellers
     SET activation_status = 'active',
         is_active = true
   WHERE id = _reseller_id;

  IF _payment_id IS NOT NULL THEN
    SELECT amount_cents, COALESCE(bonus_cents, 0), promotion_id
      INTO _amount, _bonus_paid, _stored_promo_id
      FROM public.activation_payments
     WHERE id = _payment_id;

    IF _amount IS NOT NULL AND _amount > 0 THEN
      PERFORM public.credit_reseller_balance(
        _reseller_id, _amount, 'activation_credit',
        'Saldo inicial — pagamento de ativação do painel', _payment_id
      );
    END IF;

    IF _bonus_paid IS NOT NULL AND _bonus_paid > 0 THEN
      PERFORM public.credit_reseller_balance(
        _reseller_id, _bonus_paid, 'activation_bonus',
        'Bônus promocional de adesão', _payment_id
      );
    END IF;

    SELECT id INTO _effective_promo_id
      FROM public.promotions
     WHERE status = 'active'
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at   IS NULL OR ends_at   >  now())
     ORDER BY activated_at DESC NULLS LAST
     LIMIT 1;

    IF _effective_promo_id IS NULL THEN
      _effective_promo_id := _stored_promo_id;
    END IF;

    IF _effective_promo_id IS NOT NULL THEN
      SELECT activation_promote_to_tier_id,
             activation_referral_extra_pct,
             COALESCE(activation_bonus_cents, 0)
        INTO _promote_tier, _extra_pct, _bonus_cents_promo
        FROM public.promotions
       WHERE id = _effective_promo_id;

      IF _effective_promo_id IS DISTINCT FROM _stored_promo_id THEN
        UPDATE public.activation_payments
           SET promotion_id = _effective_promo_id
         WHERE id = _payment_id;
      END IF;

      IF _bonus_cents_promo > COALESCE(_bonus_paid, 0) THEN
        _bonus_extra := _bonus_cents_promo - COALESCE(_bonus_paid, 0);
        PERFORM public.credit_reseller_balance(
          _reseller_id, _bonus_extra, 'activation_bonus',
          'Bônus promocional de adesão (ajuste retroativo da promoção ativa)',
          _payment_id
        );
        UPDATE public.activation_payments
           SET bonus_cents = _bonus_cents_promo
         WHERE id = _payment_id;
      END IF;

      IF _promote_tier IS NOT NULL THEN
        UPDATE public.resellers
           SET bonus_min_tier_id = _promote_tier,
               updated_at = now()
         WHERE id = _reseller_id;
      END IF;

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
$function$;
