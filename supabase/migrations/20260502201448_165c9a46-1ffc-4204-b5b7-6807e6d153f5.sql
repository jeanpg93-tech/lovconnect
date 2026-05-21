ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_test_24h
  ON public.orders (reseller_id, is_test, created_at DESC)
  WHERE is_test = true;