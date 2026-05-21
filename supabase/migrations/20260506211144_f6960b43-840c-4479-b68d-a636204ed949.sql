ALTER TABLE public.extension_customizations 
ADD COLUMN IF NOT EXISTS license_extra_buttons JSONB DEFAULT '[]';