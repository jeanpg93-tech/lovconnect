ALTER TABLE public.extension_customizations
ADD COLUMN card_border_color TEXT DEFAULT 'rgba(255,255,255,0.06)',
ADD COLUMN card_border_hover_color TEXT DEFAULT 'rgba(255,255,255,0.12)',
ADD COLUMN card_bg_color TEXT DEFAULT '#18181b',
ADD COLUMN card_text_color TEXT DEFAULT '#f4f4f5',
ADD COLUMN card_muted_text_color TEXT DEFAULT '#a1a1aa',
ADD COLUMN popup_card_border_color TEXT,
ADD COLUMN popup_card_border_hover_color TEXT,
ADD COLUMN popup_card_bg_color TEXT,
ADD COLUMN popup_card_text_color TEXT,
ADD COLUMN popup_card_muted_text_color TEXT;

-- Initialize with defaults for existing records
UPDATE public.extension_customizations 
SET card_border_color = 'rgba(255,255,255,0.06)',
    card_border_hover_color = 'rgba(255,255,255,0.12)',
    card_bg_color = '#18181b',
    card_text_color = '#f4f4f5',
    card_muted_text_color = '#a1a1aa'
WHERE card_border_color IS NULL;