
-- pricing_plans: hide internal cost columns from non-managers (managers read via RPC)
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon;

-- resellers: restrict anon to safe public columns only
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, slug, display_name, is_active, recharge_plans_enabled) ON public.resellers TO anon;
