ALTER TABLE public.reseller_storefronts
  ADD COLUMN IF NOT EXISTS background_effect text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS layout_mode text NOT NULL DEFAULT 'grid';

ALTER TABLE public.reseller_storefronts
  ADD CONSTRAINT reseller_storefronts_background_effect_chk
    CHECK (background_effect IN ('none','grid','circles','flames'));

ALTER TABLE public.reseller_storefronts
  ADD CONSTRAINT reseller_storefronts_layout_mode_chk
    CHECK (layout_mode IN ('grid','list'));