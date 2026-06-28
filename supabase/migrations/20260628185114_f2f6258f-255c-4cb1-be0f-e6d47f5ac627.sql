UPDATE public.claude_plan_prices SET cost_cents = 4000  WHERE plan_code = '5x_7d';
UPDATE public.claude_plan_prices SET cost_cents = 7090  WHERE plan_code = '5x_30d';
UPDATE public.claude_plan_prices SET cost_cents = 10900 WHERE plan_code = '20x_30d';
UPDATE public.claude_plan_prices SET is_active = false  WHERE plan_code = 'pro_30d';
-- recalcula sale_price com base no markup atual
UPDATE public.claude_plan_prices
SET sale_price_cents = CASE
  WHEN markup_mode = 'percent'   THEN GREATEST(0, ((cost_cents * (10000 + markup_value_cents)) / 10000)::bigint)
  WHEN markup_mode = 'fixed_add' THEN GREATEST(0, cost_cents + markup_value_cents)
  ELSE GREATEST(0, markup_value_cents)
END
WHERE plan_code IN ('5x_7d','5x_30d','20x_30d');