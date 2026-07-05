
-- 1) resellers: expose only public columns to anonymous visitors
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;

-- 2) claude_plan_prices: hide internal platform cost from resellers
REVOKE SELECT (cost_cents, reseller_cost_cents) ON public.claude_plan_prices FROM authenticated;

-- 3) claude_orders: hide internal cost/profit from resellers; admin view for gerente
REVOKE SELECT (cost_cents, profit_cents) ON public.claude_orders FROM authenticated;

DROP VIEW IF EXISTS public.claude_orders_admin;
CREATE VIEW public.claude_orders_admin
WITH (security_invoker = false) AS
SELECT * FROM public.claude_orders
WHERE public.has_role(auth.uid(), 'gerente'::app_role);
GRANT SELECT ON public.claude_orders_admin TO authenticated;

-- 4) reseller_credit_purchases: hide platform cost from resellers
REVOKE SELECT (cost_cents) ON public.reseller_credit_purchases FROM authenticated;

-- 5) provider payloads / payer PII: hide from resellers and customers
REVOKE SELECT (raw_response) ON public.activation_payments FROM authenticated;
REVOKE SELECT (raw_response, payer_document, payer_name) ON public.recharge_intents FROM authenticated;
REVOKE SELECT (provider_response) ON public.orders FROM authenticated;
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated;

-- Admin view for gerente to still access payer name/paid dashboards
DROP VIEW IF EXISTS public.recharge_intents_admin;
CREATE VIEW public.recharge_intents_admin
WITH (security_invoker = false) AS
SELECT * FROM public.recharge_intents
WHERE public.has_role(auth.uid(), 'gerente'::app_role);
GRANT SELECT ON public.recharge_intents_admin TO authenticated;
