ALTER TABLE public.extension_customizations
ADD COLUMN greeting_text TEXT DEFAULT 'Olá, Cliente',
ADD COLUMN currency_symbol TEXT DEFAULT 'MZN',
ADD COLUMN footer_text TEXT DEFAULT 'Desenvolvido em Moçambique',
ADD COLUMN show_greeting_badge BOOLEAN DEFAULT true,
ADD COLUMN color_success TEXT DEFAULT '#34d399',
ADD COLUMN popup_greeting_text TEXT,
ADD COLUMN popup_currency_symbol TEXT,
ADD COLUMN popup_footer_text TEXT,
ADD COLUMN popup_show_greeting_badge BOOLEAN;

-- Update existing records with defaults if needed
UPDATE public.extension_customizations 
SET greeting_text = 'Olá, Cliente',
    currency_symbol = 'MZN',
    footer_text = 'Desenvolvido em Moçambique',
    show_greeting_badge = true,
    color_success = '#34d399'
WHERE greeting_text IS NULL;