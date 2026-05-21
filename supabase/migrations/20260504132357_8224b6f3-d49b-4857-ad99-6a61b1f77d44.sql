ALTER TABLE public.reseller_tiers
  ADD COLUMN IF NOT EXISTS test_keys_per_day INTEGER NOT NULL DEFAULT 10;