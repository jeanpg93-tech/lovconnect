
-- 1) Reset recharge_plans grants — only safe columns to authenticated/anon
REVOKE SELECT ON public.recharge_plans FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id, name, description, duration_days, credits_per_day,
  total_credits_cap, delivery_hour, is_active, created_at, updated_at
) ON public.recharge_plans TO authenticated, anon;

GRANT ALL ON public.recharge_plans TO service_role;

-- 2) Keep RLS policy permissive on rows (column grants enforce field-level access)
DROP POLICY IF EXISTS "Public can view active recharge plans" ON public.recharge_plans;

-- 3) Secure RPC so resellers can fetch the cost/bot email they need to sell
CREATE OR REPLACE FUNCTION public.reseller_list_recharge_plans()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  duration_days integer,
  credits_per_day integer,
  total_credits_cap integer,
  delivery_hour integer,
  is_active boolean,
  base_cost_cents bigint,
  bot_owner_email text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.name, p.description, p.duration_days, p.credits_per_day,
    p.total_credits_cap, p.delivery_hour, p.is_active,
    p.base_cost_cents, p.bot_owner_email,
    p.created_at, p.updated_at
  FROM public.recharge_plans p
  WHERE EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.user_id = auth.uid() AND r.is_active = true
  )
  ORDER BY p.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.reseller_list_recharge_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reseller_list_recharge_plans() TO authenticated;

-- 4) Realtime broadcast/presence channel authorization: deny-all by default
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all broadcast" ON realtime.messages;
CREATE POLICY "deny all broadcast"
  ON realtime.messages
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
