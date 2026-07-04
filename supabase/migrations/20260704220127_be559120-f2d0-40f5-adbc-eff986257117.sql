ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS customer_refund_full_name text,
  ADD COLUMN IF NOT EXISTS customer_refund_pix_key text,
  ADD COLUMN IF NOT EXISTS customer_refund_pix_key_type text,
  ADD COLUMN IF NOT EXISTS customer_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_refunded_by uuid,
  ADD COLUMN IF NOT EXISTS customer_refund_note text;