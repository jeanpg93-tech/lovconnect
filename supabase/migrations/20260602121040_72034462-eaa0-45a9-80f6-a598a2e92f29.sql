
CREATE OR REPLACE FUNCTION public.pack_refund_credit(
  _reseller_id uuid,
  _order_id uuid,
  _description text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
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
  VALUES (_reseller_id, 'sale_refund', 1, _new_balance, _order_id, _description);

  RETURN _new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.pack_refund_credit(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pack_refund_credit(uuid, uuid, text) TO service_role;
