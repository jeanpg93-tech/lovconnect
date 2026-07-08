
-- 1) RESELLERS
DROP POLICY IF EXISTS "Anon vê revendedores ativos (colunas públicas)" ON public.resellers;
DROP POLICY IF EXISTS "Autenticado ve revendedores ativos" ON public.resellers;

DROP VIEW IF EXISTS public.resellers_public;
CREATE VIEW public.resellers_public
WITH (security_invoker = off) AS
SELECT id, display_name, slug, is_active
FROM public.resellers
WHERE is_active = true;
GRANT SELECT ON public.resellers_public TO anon, authenticated;

-- 2) CLAUDE_PLAN_PRICES
DROP POLICY IF EXISTS "claude_plan_prices read all authenticated" ON public.claude_plan_prices;

CREATE POLICY "claude_plan_prices gerente read"
  ON public.claude_plan_prices
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

DROP VIEW IF EXISTS public.claude_plan_prices_public;
CREATE VIEW public.claude_plan_prices_public
WITH (security_invoker = off) AS
SELECT id, plan_code, sale_price_cents, is_active, sort_order, created_at, updated_at
FROM public.claude_plan_prices;
GRANT SELECT ON public.claude_plan_prices_public TO authenticated, anon;

-- 3) Provider payload columns
REVOKE SELECT (provider_response) ON public.orders                     FROM authenticated, anon, PUBLIC;
REVOKE SELECT (raw_response)      ON public.storefront_orders          FROM authenticated, anon, PUBLIC;
REVOKE SELECT (raw_response)      ON public.recharge_intents           FROM authenticated, anon, PUBLIC;
REVOKE SELECT (provider_response) ON public.reseller_credit_purchases  FROM authenticated, anon, PUBLIC;
REVOKE SELECT (raw_response)      ON public.activation_payments        FROM authenticated, anon, PUBLIC;

-- 4) provider_credit_orders
REVOKE SELECT (email_convite_bot, provider_response)
  ON public.provider_credit_orders FROM authenticated, anon, PUBLIC;
