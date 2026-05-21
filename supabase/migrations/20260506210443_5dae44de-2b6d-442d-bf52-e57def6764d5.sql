ALTER TABLE public.extension_customizations 
ADD COLUMN IF NOT EXISTS license_title TEXT,
ADD COLUMN IF NOT EXISTS license_description TEXT,
ADD COLUMN IF NOT EXISTS license_placeholder TEXT,
ADD COLUMN IF NOT EXISTS license_button_text TEXT,
ADD COLUMN IF NOT EXISTS license_buy_button_text TEXT;