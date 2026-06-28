ALTER TABLE public.claude_orders 
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT;