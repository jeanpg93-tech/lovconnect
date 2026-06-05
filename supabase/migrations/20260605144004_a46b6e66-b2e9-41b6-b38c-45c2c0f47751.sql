-- 1) pricing_plans: hide cost_cents and markup_percent from anon/authenticated
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon, authenticated, PUBLIC;

-- 2) reseller_integrations: hide credential columns from authenticated reads
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon, authenticated, PUBLIC;

-- 3) resellers: restrict anon SELECT to only safe public columns.
-- Revoke all column SELECT for anon then grant on the safe subset.
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;
