
-- Sincroniza pedido Claude 85b6dbcc-8383-4730-abe0-24658995d7e3:
-- provedor confirmou que a chave já foi cancelada, mas nosso status local
-- ainda estava `redeemed`. Estorna a diferença ainda em aberto (dentro dos 7 dias).
DO $$
DECLARE
  v_order_id uuid := '85b6dbcc-8383-4730-abe0-24658995d7e3';
  v_reseller uuid;
  v_debited int;
  v_refunded int;
  v_missing int;
BEGIN
  SELECT reseller_id INTO v_reseller FROM public.claude_orders WHERE id = v_order_id;

  SELECT COALESCE(SUM(-amount_cents), 0) INTO v_debited
    FROM public.balance_transactions
   WHERE reference_id = v_order_id AND kind = 'claude_key_issue';

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_refunded
    FROM public.balance_transactions
   WHERE reference_id = v_order_id AND kind IN ('claude_refund','claude_key_refund');

  v_missing := v_debited - v_refunded;

  IF v_missing > 0 THEN
    PERFORM public.credit_reseller_balance(
      v_reseller,
      v_missing,
      'claude_key_refund',
      'Cancelamento chave Claude pro_30d (sync manual provedor)',
      v_order_id
    );
  END IF;

  UPDATE public.claude_orders
     SET status = 'cancelled',
         cancelled_at = COALESCE(cancelled_at, now())
   WHERE id = v_order_id;
END $$;
