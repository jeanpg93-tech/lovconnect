
DO $$ BEGIN
  CREATE TYPE public.onboarding_tour_status AS ENUM ('pending','completed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS onboarding_tour_status public.onboarding_tour_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_tour_completed_at timestamptz;

-- Marca contas existentes como já vistas (só novos revendedores verão o tour)
UPDATE public.resellers
   SET onboarding_tour_status = 'completed',
       onboarding_tour_completed_at = COALESCE(onboarding_tour_completed_at, now())
 WHERE onboarding_tour_status = 'pending';
