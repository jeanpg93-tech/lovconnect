ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS provider_user_id text,
  ADD COLUMN IF NOT EXISTS provider_api_key text;
CREATE INDEX IF NOT EXISTS idx_claude_orders_provider_user_id ON public.claude_orders(provider_user_id);
CREATE INDEX IF NOT EXISTS idx_claude_orders_customer_email_lower ON public.claude_orders(lower(customer_email));