ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS evolution_confirmation_template text NOT NULL DEFAULT 'Seu código de confirmação é: {codigo}';