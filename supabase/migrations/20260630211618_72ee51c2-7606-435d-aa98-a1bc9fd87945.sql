
-- 1) claude_orders: revoke broad SELECT; grant only safe columns to authenticated
REVOKE SELECT ON public.claude_orders FROM authenticated;
GRANT SELECT (
  id, reseller_id, plan_code, customer_identifier, sale_price_cents,
  provider_key_id, code, code_revealed_at, status, error_message,
  request_id, created_at, updated_at, customer_name, customer_whatsapp,
  cancelled_at, cancel_attempts, customer_email, redeemed_at, expired_at,
  tokens_exhausted_at
) ON public.claude_orders TO authenticated;

-- 2) claude_plan_prices: hide cost/markup fields from clients
REVOKE SELECT ON public.claude_plan_prices FROM authenticated;
REVOKE SELECT ON public.claude_plan_prices FROM anon;
GRANT SELECT (id, plan_code, sale_price_cents, is_active, created_at, updated_at)
  ON public.claude_plan_prices TO authenticated;

-- 3) tier_claude_prices: drop the broad authenticated read policy
DROP POLICY IF EXISTS "authenticated read tier_claude_prices" ON public.tier_claude_prices;

-- 4) resellers: restrict anon to public-facing columns only
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, slug, display_name, is_active, recharge_plans_enabled)
  ON public.resellers TO anon;
