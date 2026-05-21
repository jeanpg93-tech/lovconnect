ALTER TABLE public.extension_customizations
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_link TEXT,
  ADD COLUMN IF NOT EXISTS banner_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS history_enabled BOOLEAN NOT NULL DEFAULT true;