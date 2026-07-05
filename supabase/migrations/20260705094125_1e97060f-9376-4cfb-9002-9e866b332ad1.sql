ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS trial_messages_limit integer;

CREATE INDEX IF NOT EXISTS idx_claude_orders_trial
  ON public.claude_orders (reseller_id, is_trial, created_at DESC)
  WHERE is_trial = true;