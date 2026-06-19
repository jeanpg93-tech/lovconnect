
-- 1) reseller_recharge_plan_prices: hide internal cost from resellers
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM anon, authenticated;

-- 2) provider_credit_orders: hide bot invitation email from ordering user
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM anon, authenticated;

-- 3) reseller_integrations: hide sensitive credentials (write-only from client)
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon, authenticated;

-- 4) storefront_orders: hide raw provider payment payload from clients
REVOKE SELECT (raw_response) ON public.storefront_orders FROM anon, authenticated;

-- 5) orders: hide provider_response payload from resellers/clients
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='provider_response'
  ) THEN
    EXECUTE 'REVOKE SELECT (provider_response) ON public.orders FROM anon, authenticated';
  END IF;
END $$;

-- 6) recharge_plans: defense in depth — hide internal cost and bot owner email
REVOKE SELECT (base_cost_cents, platform_cost_cents, bot_owner_email)
  ON public.recharge_plans FROM anon, authenticated;
