ALTER TABLE public.recharge_plans
  ADD COLUMN IF NOT EXISTS platform_cost_cents integer NOT NULL DEFAULT 0;