CREATE OR REPLACE FUNCTION public.activate_reseller(_reseller_id uuid, _payment_id uuid DEFAULT NULL::uuid, _actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bronze UUID;
  _amount BIGINT;
  _already_credited BOOLEAN;
BEGIN
  SELECT id INTO _bronze FROM public.reseller_tiers WHERE slug = 'bronze' LIMIT 1;

  UPDATE public.resellers
    SET activation_status = 'active',
        is_active = true,
        bonus_min_tier_id = COALESCE(bonus_min_tier_id, _bronze),
        updated_at = now()
    WHERE id = _reseller_id;

  IF _payment_id IS NOT NULL THEN
    UPDATE public.activation_payments
      SET status = 'approved',
          activated_at = now(),
          updated_at = now()
      WHERE id = _payment_id AND status <> 'approved';

    -- Credita o valor pago na ativação como saldo inicial na carteira.
    -- Idempotente: só credita se ainda não existe uma transação com este reference_id.
    SELECT amount_cents INTO _amount
      FROM public.activation_payments
      WHERE id = _payment_id;

    IF _amount IS NOT NULL AND _amount > 0 THEN
      SELECT EXISTS (
        SELECT 1 FROM public.balance_transactions
        WHERE reference_id = _payment_id
          AND kind = 'activation_credit'
      ) INTO _already_credited;

      IF NOT _already_credited THEN
        PERFORM public.credit_reseller_balance(
          _reseller_id,
          _amount,
          'activation_credit',
          'Saldo inicial — pagamento de ativação do painel',
          _payment_id
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.activation_logs (reseller_id, event, actor_id, metadata)
    VALUES (_reseller_id, 'activated', _actor_id, jsonb_build_object('payment_id', _payment_id, 'wallet_credited_cents', _amount));
END;
$function$;