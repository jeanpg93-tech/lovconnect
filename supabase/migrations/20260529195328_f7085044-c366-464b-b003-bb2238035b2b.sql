ALTER TABLE public.telegram_settings
  ADD COLUMN IF NOT EXISTS notify_subscription_sales boolean NOT NULL DEFAULT true;