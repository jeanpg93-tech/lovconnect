ALTER TABLE public.extension_customizations
ADD COLUMN use_license_name BOOLEAN DEFAULT true,
ADD COLUMN popup_use_license_name BOOLEAN;

-- Update existing records to match the requested default
UPDATE public.extension_customizations 
SET use_license_name = true
WHERE use_license_name IS NULL;