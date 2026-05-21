ALTER TABLE public.extension_customizations
  DROP COLUMN IF EXISTS badge_text,
  DROP COLUMN IF EXISTS accent_color,
  DROP COLUMN IF EXISTS bg_color,
  DROP COLUMN IF EXISTS text_color,
  DROP COLUMN IF EXISTS texts,
  DROP COLUMN IF EXISTS features,
  DROP COLUMN IF EXISTS support_url,
  DROP COLUMN IF EXISTS last_build_path,
  DROP COLUMN IF EXISTS last_build_at;
