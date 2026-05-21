ALTER TABLE public.reseller_storefronts 
ADD COLUMN IF NOT EXISTS show_extensions BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_free_trial BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_products BOOLEAN DEFAULT true;
