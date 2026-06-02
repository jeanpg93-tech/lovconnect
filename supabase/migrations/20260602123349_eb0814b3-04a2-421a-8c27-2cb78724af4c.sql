ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS delivery_source TEXT,
  ADD COLUMN IF NOT EXISTS fallback_from_pack BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_delivery_source
  ON public.storefront_orders (delivery_source)
  WHERE delivery_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_fallback
  ON public.storefront_orders (reseller_id, created_at)
  WHERE fallback_from_pack = true;