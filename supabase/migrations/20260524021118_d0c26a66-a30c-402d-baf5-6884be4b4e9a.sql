
ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS cancellation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS key_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_revoke_error text,
  ADD COLUMN IF NOT EXISTS client_refund_method text,
  ADD COLUMN IF NOT EXISTS client_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_refund_pix_key text,
  ADD COLUMN IF NOT EXISTS client_refund_endtoend_id text,
  ADD COLUMN IF NOT EXISTS client_refund_error text,
  ADD COLUMN IF NOT EXISTS balance_refunded_at timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS key_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_revoke_error text,
  ADD COLUMN IF NOT EXISTS client_refund_method text,
  ADD COLUMN IF NOT EXISTS client_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_refund_pix_key text,
  ADD COLUMN IF NOT EXISTS client_refund_endtoend_id text,
  ADD COLUMN IF NOT EXISTS client_refund_error text,
  ADD COLUMN IF NOT EXISTS balance_refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_cancellation
  ON public.storefront_orders (cancellation_status)
  WHERE cancellation_status <> 'none';

CREATE INDEX IF NOT EXISTS idx_orders_cancellation
  ON public.orders (cancellation_status)
  WHERE cancellation_status <> 'none';
