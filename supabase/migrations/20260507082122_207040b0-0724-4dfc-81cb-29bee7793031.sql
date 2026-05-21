CREATE OR REPLACE FUNCTION public.force_debit_reseller_balance(_reseller_id uuid, _amount_cents bigint, _kind text, _description text, _reference_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, 0) ON CONFLICT (reseller_id) DO NOTHING;
  UPDATE public.reseller_balances
    SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE reseller_id = _reseller_id;
  INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id)
    VALUES (_reseller_id, -_amount_cents, _kind, _description, _reference_id);
END;
$$;