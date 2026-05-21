ALTER TABLE public.reseller_storefronts
  ADD COLUMN IF NOT EXISTS support_channel text,
  ADD COLUMN IF NOT EXISTS support_value text;

ALTER TABLE public.reseller_storefronts
  DROP CONSTRAINT IF EXISTS reseller_storefronts_support_channel_check;
ALTER TABLE public.reseller_storefronts
  ADD CONSTRAINT reseller_storefronts_support_channel_check
  CHECK (support_channel IS NULL OR support_channel IN ('whatsapp','discord','telegram'));