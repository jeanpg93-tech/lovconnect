
ALTER TABLE public.claude_orders
  ALTER COLUMN reseller_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manager_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.claude_orders
  DROP CONSTRAINT IF EXISTS claude_orders_owner_chk;
ALTER TABLE public.claude_orders
  ADD CONSTRAINT claude_orders_owner_chk
  CHECK (reseller_id IS NOT NULL OR manager_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_claude_orders_manager_user
  ON public.claude_orders (manager_user_id, created_at DESC)
  WHERE manager_user_id IS NOT NULL;
