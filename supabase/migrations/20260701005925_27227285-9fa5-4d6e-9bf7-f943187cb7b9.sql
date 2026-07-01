
ALTER TABLE public.claude_plan_prices
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE public.claude_plan_prices
SET cost_cents = 40000, is_active = true, sort_order = 1, updated_at = now()
WHERE plan_code = 'pro_30d';

UPDATE public.claude_plan_prices
SET cost_cents = 7090, sort_order = 2, updated_at = now()
WHERE plan_code = '5x_30d';

UPDATE public.claude_plan_prices
SET cost_cents = 10900, sort_order = 3, updated_at = now()
WHERE plan_code = '20x_30d';
