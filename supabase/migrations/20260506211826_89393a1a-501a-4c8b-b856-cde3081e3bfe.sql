ALTER TABLE public.extension_customizations 
ADD COLUMN IF NOT EXISTS license_emoji TEXT DEFAULT '🔑',
ADD COLUMN IF NOT EXISTS license_emoji_size INTEGER DEFAULT 64;