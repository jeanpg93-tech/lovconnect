ALTER TABLE public.resellers ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_resellers_is_demo ON public.resellers(is_demo) WHERE is_demo = true;