
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS recharge_plans_enabled boolean NOT NULL DEFAULT false;

INSERT INTO public.app_settings (key, value)
VALUES ('recharge_plans_enabled_globally', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
