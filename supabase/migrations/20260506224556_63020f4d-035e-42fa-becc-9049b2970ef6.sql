ALTER TABLE public.reseller_storefronts
  ADD COLUMN IF NOT EXISTS access_extension_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_extension_mode text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS access_extension_custom_url text,
  ADD COLUMN IF NOT EXISTS reset_device_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_whatsapp text,
  ADD COLUMN IF NOT EXISTS support_discord_url text,
  ADD COLUMN IF NOT EXISTS support_telegram_url text;

ALTER TABLE public.reseller_storefronts
  DROP CONSTRAINT IF EXISTS reseller_storefronts_access_mode_chk;
ALTER TABLE public.reseller_storefronts
  ADD CONSTRAINT reseller_storefronts_access_mode_chk
  CHECK (access_extension_mode IN ('native','custom'));