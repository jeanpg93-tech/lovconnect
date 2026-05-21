ALTER TABLE public.extension_customizations
ADD COLUMN header_badge_text TEXT DEFAULT 'PRO',
ADD COLUMN greeting_badge_text TEXT DEFAULT 'PRO',
ADD COLUMN popup_header_badge_text TEXT,
ADD COLUMN popup_greeting_badge_text TEXT;

-- Initialize new columns with the old brand_badge value for existing records
UPDATE public.extension_customizations 
SET header_badge_text = COALESCE(brand_badge, 'PRO'),
    greeting_badge_text = COALESCE(brand_badge, 'PRO');