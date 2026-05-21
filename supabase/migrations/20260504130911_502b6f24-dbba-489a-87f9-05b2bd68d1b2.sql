
CREATE OR REPLACE FUNCTION public.add_referral_commission(_referral_id uuid, _amount_cents bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.reseller_referrals
    SET total_commission_cents = total_commission_cents + _amount_cents
    WHERE id = _referral_id;
$$;
