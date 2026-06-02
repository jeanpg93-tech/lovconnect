
CREATE OR REPLACE FUNCTION public.debit_reseller_balance_pack_fallback(
  _reseller_id uuid,
  _amount_cents bigint,
  _kind text,
  _description text,
  _reference_id uuid,
  _promotion_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _current bigint;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, 0) ON CONFLICT (reseller_id) DO NOTHING;
  SELECT balance_cents INTO _current FROM public.reseller_balances
    WHERE reseller_id = _reseller_id FOR UPDATE;
  IF _current < _amount_cents THEN RETURN false; END IF;
  UPDATE public.reseller_balances
    SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE reseller_id = _reseller_id;
  INSERT INTO public.balance_transactions
    (reseller_id, amount_cents, kind, description, reference_id, promotion_id, fallback_from_pack)
    VALUES (_reseller_id, -_amount_cents, _kind, _description, _reference_id, _promotion_id, true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_reseller_balance_pack_fallback(uuid, bigint, text, text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_reseller_balance_pack_fallback(uuid, bigint, text, text, uuid, uuid) TO service_role;
