
-- Add new enum values (must be committed before use)
ALTER TYPE public.claude_order_status ADD VALUE IF NOT EXISTS 'redeemed';
ALTER TYPE public.claude_order_status ADD VALUE IF NOT EXISTS 'cancel_rejected';
ALTER TYPE public.claude_order_status ADD VALUE IF NOT EXISTS 'cancel_requested';

-- Cancellation-request tracking
ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_request_note text,
  ADD COLUMN IF NOT EXISTS refund_waived boolean NOT NULL DEFAULT false;
