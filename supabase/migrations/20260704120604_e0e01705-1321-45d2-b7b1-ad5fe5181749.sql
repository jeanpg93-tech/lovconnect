-- 1) BALANCE RPCs — service_role only
REVOKE EXECUTE ON FUNCTION public.debit_reseller_balance(uuid,bigint,text,text,uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.credit_reseller_balance(uuid,bigint,text,text,uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.force_debit_reseller_balance(uuid,bigint,text,text,uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.add_reseller_spent(uuid,bigint) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.credit_reseller_balance_promo(uuid,bigint,text,text,uuid,uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.debit_reseller_balance_promo(uuid,bigint,text,text,uuid,uuid) FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.debit_reseller_balance(uuid,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_reseller_balance(uuid,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_debit_reseller_balance(uuid,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_reseller_spent(uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_reseller_balance_promo(uuid,bigint,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_reseller_balance_promo(uuid,bigint,text,text,uuid,uuid) TO service_role;

-- 2) reseller_integrations — secret columns hidden from client
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated, anon;

-- 3) claude_plan_prices — cost columns hidden from client
REVOKE SELECT (cost_cents, reseller_cost_cents)
  ON public.claude_plan_prices FROM authenticated, anon;

-- 4) orders.provider_response — hide raw PIX payload from clients
REVOKE SELECT (provider_response) ON public.orders FROM authenticated, anon;

-- 5) provider_credit_orders.email_convite_bot — hide from clients
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_provider_credit_orders_bot_emails()
RETURNS TABLE(id uuid, email_convite_bot text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.email_convite_bot
  FROM public.provider_credit_orders o
  WHERE public.has_role(auth.uid(), 'gerente'::app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.admin_provider_credit_orders_bot_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_credit_orders_bot_emails() TO authenticated, service_role;

-- 6) reseller_credit_purchases.cost_cents — hide from reseller
REVOKE SELECT (cost_cents) ON public.reseller_credit_purchases FROM authenticated, anon;

-- 7) reseller_recharge_plan_prices — restrict anon to safe columns
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM anon;
GRANT SELECT (id, reseller_id, plan_id, sale_price_cents, is_active, show_on_storefront)
  ON public.reseller_recharge_plan_prices TO anon;

-- 8) resellers — restrict anon to safe columns only
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active)
  ON public.resellers TO anon;

-- 9) storefront_orders.raw_response — hide from reseller
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated, anon;

-- 10) app_settings — whitelist via is_public
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

UPDATE public.app_settings
   SET is_public = true
 WHERE key IN (
   'recharge_plans_enabled_globally',
   'packs_sales_enabled_globally',
   'plano3k_sales_paused',
   'recargas_settings',
   'recarga_settings',
   'licencas.delivery.method',
   'licencas.valores',
   'evolution_template_license',
   'evolution_template_recharge',
   'evolution_template_storefront'
 );

DROP POLICY IF EXISTS "Authenticated can read non-sensitive settings" ON public.app_settings;
CREATE POLICY "Authenticated can read public settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (is_public = true);