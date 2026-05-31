ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS subscription_sales_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_sales_disabled boolean NOT NULL DEFAULT false;