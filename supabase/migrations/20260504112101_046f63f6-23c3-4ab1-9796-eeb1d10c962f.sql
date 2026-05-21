ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS min_price_cents integer NOT NULL DEFAULT 0;