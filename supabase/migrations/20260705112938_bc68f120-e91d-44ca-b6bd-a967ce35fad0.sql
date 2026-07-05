
-- Drop the SECURITY DEFINER views created previously
DROP VIEW IF EXISTS public.claude_orders_admin;
DROP VIEW IF EXISTS public.recharge_intents_admin;

-- Admin RPC: returns claude_orders financial fields for gerente only
CREATE OR REPLACE FUNCTION public.admin_claude_orders_financial(
  _from timestamptz DEFAULT NULL,
  _to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  reseller_id uuid,
  plan_code text,
  sale_price_cents integer,
  cost_cents integer,
  profit_cents integer,
  paid_at timestamptz,
  created_at timestamptz,
  status text,
  customer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, reseller_id, plan_code, sale_price_cents, cost_cents, profit_cents,
         paid_at, created_at, status, customer_name
  FROM public.claude_orders
  WHERE public.has_role(auth.uid(), 'gerente'::app_role)
    AND (_from IS NULL OR paid_at >= _from)
    AND (_to   IS NULL OR paid_at <= _to);
$$;

REVOKE ALL ON FUNCTION public.admin_claude_orders_financial(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_claude_orders_financial(timestamptz, timestamptz) TO authenticated;

-- Admin RPC: returns recharge_intents rows (including payer name) for gerente only
CREATE OR REPLACE FUNCTION public.admin_recharge_intents_recent(
  _limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  status text,
  amount_cents integer,
  bonus_cents integer,
  reseller_id uuid,
  payer_name text,
  paid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, created_at, status, amount_cents, bonus_cents, reseller_id,
         payer_name, paid_at
  FROM public.recharge_intents
  WHERE public.has_role(auth.uid(), 'gerente'::app_role)
  ORDER BY created_at DESC
  LIMIT COALESCE(_limit, 500);
$$;

REVOKE ALL ON FUNCTION public.admin_recharge_intents_recent(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recharge_intents_recent(integer) TO authenticated;
