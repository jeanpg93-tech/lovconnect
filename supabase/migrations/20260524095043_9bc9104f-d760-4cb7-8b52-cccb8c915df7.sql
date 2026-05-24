
ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS cancellation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS client_refund_method text,
  ADD COLUMN IF NOT EXISTS client_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_refund_pix_key text,
  ADD COLUMN IF NOT EXISTS client_refund_endtoend_id text,
  ADD COLUMN IF NOT EXISTS client_refund_error text,
  ADD COLUMN IF NOT EXISTS balance_refunded_at timestamptz;
