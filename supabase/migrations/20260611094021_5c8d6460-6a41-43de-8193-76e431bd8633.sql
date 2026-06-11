
UPDATE public.reseller_recharge_plan_subscriptions
SET status = 'active',
    cancelled_at = NULL,
    cancelled_reason = NULL,
    updated_at = now()
WHERE id = 'd7c4f4bb-c878-4284-9d60-ef3a040cd437'
  AND status = 'cancelled';

UPDATE public.reseller_balances
SET balance_cents = balance_cents - 10000,
    updated_at = now()
WHERE reseller_id = '68fddcfb-5e1f-492c-be75-9a8a3d2a63fa';

DELETE FROM public.balance_transactions
WHERE id = '7f1e5ef3-481e-4dbb-9096-5e699b4b8f0b';
