ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_whatsapp text;
CREATE INDEX IF NOT EXISTS idx_rcp_customer_whatsapp ON public.reseller_credit_purchases (customer_whatsapp);