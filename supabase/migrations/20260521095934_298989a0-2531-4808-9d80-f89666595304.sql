ALTER TABLE public.extensions
  ADD COLUMN IF NOT EXISTS method text;

ALTER TABLE public.extensions
  DROP CONSTRAINT IF EXISTS extensions_method_check;

ALTER TABLE public.extensions
  ADD CONSTRAINT extensions_method_check
  CHECK (method IS NULL OR method IN ('flow','lovax'));

CREATE INDEX IF NOT EXISTS extensions_method_active_idx
  ON public.extensions (method) WHERE is_active = true;