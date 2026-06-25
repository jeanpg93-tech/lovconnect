-- Converte plan_code de enum para texto nas 3 tabelas
ALTER TABLE public.claude_plan_prices ALTER COLUMN plan_code TYPE text USING plan_code::text;
ALTER TABLE public.claude_reseller_price_overrides ALTER COLUMN plan_code TYPE text USING plan_code::text;
ALTER TABLE public.claude_orders ALTER COLUMN plan_code TYPE text USING plan_code::text;

-- Remove enum antigo
DROP TYPE IF EXISTS public.claude_plan_code;

-- Limpa preços antigos (códigos não usados pelo fornecedor)
DELETE FROM public.claude_plan_prices
WHERE plan_code IN ('mini_token','medium_token','mini_subscription','medium_subscription');

-- Insere os planos do fornecedor (custos zerados — serão sincronizados)
INSERT INTO public.claude_plan_prices (plan_code, cost_cents, markup_mode, markup_value_cents, sale_price_cents)
VALUES
  ('5x_7d',   0, 'percent', 3000, 0),
  ('5x_30d',  0, 'percent', 3000, 0),
  ('20x_30d', 0, 'percent', 3000, 0),
  ('pro_30d', 0, 'percent', 3000, 0)
ON CONFLICT (plan_code) DO NOTHING;