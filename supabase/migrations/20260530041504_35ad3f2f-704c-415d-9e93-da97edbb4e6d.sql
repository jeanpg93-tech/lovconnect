CREATE OR REPLACE FUNCTION public.pack_refund_credit(_reseller_id uuid, _order_id uuid, _description text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _already INTEGER;
  _was_consumed INTEGER;
  _new_balance INTEGER;
BEGIN
  -- Só devolve crédito se a chave FOI gerada consumindo um crédito do pack.
  -- Chaves antigas/avulsas não têm entrada 'consume' no ledger e portanto
  -- não devem inflar o saldo do pacote ao serem revogadas.
  SELECT COUNT(*) INTO _was_consumed
    FROM public.reseller_pack_ledger
    WHERE order_id = _order_id AND kind = 'consume';
  IF _was_consumed = 0 THEN
    SELECT credits INTO _new_balance
      FROM public.reseller_pack_balances
      WHERE reseller_id = _reseller_id;
    RETURN COALESCE(_new_balance, 0);
  END IF;

  -- Idempotência: se já existe refund pra esse order_id, não faz de novo
  SELECT COUNT(*) INTO _already
    FROM public.reseller_pack_ledger
    WHERE order_id = _order_id AND kind = 'refund';
  IF _already > 0 THEN
    SELECT credits INTO _new_balance
      FROM public.reseller_pack_balances
      WHERE reseller_id = _reseller_id;
    RETURN COALESCE(_new_balance, 0);
  END IF;

  INSERT INTO public.reseller_pack_balances (reseller_id, credits)
  VALUES (_reseller_id, 0)
  ON CONFLICT (reseller_id) DO NOTHING;

  UPDATE public.reseller_pack_balances
    SET credits = credits + 1,
        lifetime_consumed = GREATEST(lifetime_consumed - 1, 0),
        updated_at = now()
    WHERE reseller_id = _reseller_id
    RETURNING credits INTO _new_balance;

  INSERT INTO public.reseller_pack_ledger
    (reseller_id, kind, delta_credits, balance_after, order_id, description)
  VALUES (_reseller_id, 'refund', 1, _new_balance, _order_id, _description);

  RETURN _new_balance;
END $function$;