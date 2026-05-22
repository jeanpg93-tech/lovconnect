ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_pending_expires
  ON public.storefront_orders (expires_at)
  WHERE status = 'pending';