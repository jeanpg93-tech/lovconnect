
-- Restringir colunas sensíveis ao nível de coluna, mantendo RLS existente.
-- service_role e definer-security functions continuam com acesso total.

-- 1) claude_orders.cost_cents (custo interno)
REVOKE SELECT (cost_cents) ON public.claude_orders FROM anon, authenticated;

-- 2) claude_plan_prices.cost_cents (custo do fornecedor)
REVOKE SELECT (cost_cents) ON public.claude_plan_prices FROM anon, authenticated;

-- 3) orders.provider_response (payload cru do PIX/MisticPay)
REVOKE SELECT (provider_response) ON public.orders FROM anon, authenticated;

-- 4) pricing_plans.cost_cents (custo interno da licença)
REVOKE SELECT (cost_cents) ON public.pricing_plans FROM anon, authenticated;

-- 5) provider_credit_orders.email_convite_bot (interno)
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM anon, authenticated;

-- 6) recharge_intents payer_document/payer_name/raw_response (PII/payload)
REVOKE SELECT (payer_document, payer_name, raw_response) ON public.recharge_intents FROM anon, authenticated;

-- 7) reseller_credit_purchases.cost_cents (custo interno)
REVOKE SELECT (cost_cents) ON public.reseller_credit_purchases FROM anon, authenticated;

-- 8) storefront_orders.raw_response (payload cru PIX)
REVOKE SELECT (raw_response) ON public.storefront_orders FROM anon, authenticated;

-- 9) resellers: anônimo só pode ver colunas seguras (id, display_name, slug, is_active).
--    A política "Anon vê revendedores ativos" continua filtrando por is_active,
--    mas restringimos a lista de colunas visíveis para anon via GRANT nomeado.
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;
