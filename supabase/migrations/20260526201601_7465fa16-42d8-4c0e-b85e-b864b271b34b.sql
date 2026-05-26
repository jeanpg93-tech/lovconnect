
ALTER TABLE public.telegram_settings
  ADD COLUMN IF NOT EXISTS last_low_provider_critical_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS low_balance_critical_threshold_cents integer NOT NULL DEFAULT 3000;

-- Ajusta o limite padrão de aviso para R$50 caso ainda esteja no antigo R$50 (5000 cents) — mantém valor existente se já configurado.
UPDATE public.telegram_settings
SET low_balance_threshold_cents = 5000
WHERE id = 1 AND (low_balance_threshold_cents IS NULL);
