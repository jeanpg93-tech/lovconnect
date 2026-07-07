-- ============================================================
-- FASE 1: Novos planos API-only do fornecedor Claude
-- ============================================================

-- 1.1 Custo do fornecedor (claude_plan_prices)
INSERT INTO public.claude_plan_prices (
  plan_code, cost_cents, reseller_cost_cents, sale_price_cents,
  markup_mode, markup_value_cents, reseller_cost_mode, reseller_cost_markup_bps,
  is_active, sort_order
) VALUES
  ('api_500k_30d', 2000,  5200,  5200,  'percent', 3000, 'fixed', 0, true, 10),
  ('api_25m_30d',  7090, 11700,  9217,  'percent', 3000, 'fixed', 0, true, 11),
  ('api_10m_30d', 10900, 18200, 14170,  'percent', 3000, 'fixed', 0, true, 12)
ON CONFLICT (plan_code) DO NOTHING;

-- 1.2 Preços por nível de revendedor (tier_claude_prices)
-- Bronze  = 13c5f844-de96-4125-99b3-3d1efe72e914
-- Prata   = 5f18be43-43c7-45d6-b857-16c4d9b40fbd
-- Ouro    = 4e670a7f-921c-4ca1-8792-8eac2b4905ef
-- Partner = 2b252b67-789f-4156-9bbd-98e04cdd7006

INSERT INTO public.tier_claude_prices (plan_code, tier_id, reseller_cost_cents, is_active) VALUES
  -- api_500k_30d (espelha pro_30d)
  ('api_500k_30d', '13c5f844-de96-4125-99b3-3d1efe72e914', 7200, true),
  ('api_500k_30d', '5f18be43-43c7-45d6-b857-16c4d9b40fbd', 6800, true),
  ('api_500k_30d', '4e670a7f-921c-4ca1-8792-8eac2b4905ef', 6300, true),
  ('api_500k_30d', '2b252b67-789f-4156-9bbd-98e04cdd7006', 5800, true),
  -- api_25m_30d (espelha 5x_30d)
  ('api_25m_30d',  '13c5f844-de96-4125-99b3-3d1efe72e914', 14100, true),
  ('api_25m_30d',  '5f18be43-43c7-45d6-b857-16c4d9b40fbd', 13200, true),
  ('api_25m_30d',  '4e670a7f-921c-4ca1-8792-8eac2b4905ef', 12500, true),
  ('api_25m_30d',  '2b252b67-789f-4156-9bbd-98e04cdd7006', 11800, true),
  -- api_10m_30d (espelha 20x_30d)
  ('api_10m_30d',  '13c5f844-de96-4125-99b3-3d1efe72e914', 21600, true),
  ('api_10m_30d',  '5f18be43-43c7-45d6-b857-16c4d9b40fbd', 20400, true),
  ('api_10m_30d',  '4e670a7f-921c-4ca1-8792-8eac2b4905ef', 19200, true),
  ('api_10m_30d',  '2b252b67-789f-4156-9bbd-98e04cdd7006', 18000, true)
ON CONFLICT DO NOTHING;