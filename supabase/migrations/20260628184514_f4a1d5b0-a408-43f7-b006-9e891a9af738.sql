
ALTER TYPE claude_order_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE claude_order_status ADD VALUE IF NOT EXISTS 'cancel_failed';

ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_email text;
