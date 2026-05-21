ALTER TABLE public.reseller_storefronts
  ADD COLUMN IF NOT EXISTS logo_size integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS product_emojis jsonb NOT NULL DEFAULT '{}'::jsonb;