
ALTER TYPE public.claude_order_status ADD VALUE IF NOT EXISTS 'renewal_requested';
ALTER TABLE public.claude_orders ADD COLUMN IF NOT EXISTS renewal_note text;
ALTER TABLE public.claude_orders ADD COLUMN IF NOT EXISTS is_renewal boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_claude_orders_renewal ON public.claude_orders(reseller_id, is_renewal) WHERE is_renewal = true;
