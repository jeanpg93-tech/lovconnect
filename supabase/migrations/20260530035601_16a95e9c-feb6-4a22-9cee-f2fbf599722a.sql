CREATE OR REPLACE FUNCTION public.pack_refund_credit(
  _reseller_id UUID,
  _order_id UUID,
  _description TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _already INTEGER;
  _new_balance INTEGER;
BEGIN
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
END $$;

REVOKE EXECUTE ON FUNCTION public.pack_refund_credit(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pack_refund_credit(UUID,UUID,TEXT) TO service_role;