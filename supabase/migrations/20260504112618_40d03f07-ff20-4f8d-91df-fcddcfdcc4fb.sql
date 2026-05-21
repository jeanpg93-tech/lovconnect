ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES public.reseller_api_keys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_api_key_id ON public.orders(api_key_id);
CREATE INDEX IF NOT EXISTS idx_orders_license_key ON public.orders(license_key);