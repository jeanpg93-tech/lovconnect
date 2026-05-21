ALTER TABLE public.reseller_storefronts
ADD COLUMN IF NOT EXISTS visual_effect TEXT NOT NULL DEFAULT 'none';