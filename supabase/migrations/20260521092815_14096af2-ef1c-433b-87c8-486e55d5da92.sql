ALTER TABLE public.reseller_storefronts
  ADD COLUMN IF NOT EXISTS extension_method text NOT NULL DEFAULT 'flow';

ALTER TABLE public.reseller_storefronts
  DROP CONSTRAINT IF EXISTS reseller_storefronts_extension_method_check;

ALTER TABLE public.reseller_storefronts
  ADD CONSTRAINT reseller_storefronts_extension_method_check
  CHECK (extension_method IN ('flow','lovax'));