ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS idx_orders_client_ip ON public.orders (client_ip) WHERE client_ip IS NOT NULL;