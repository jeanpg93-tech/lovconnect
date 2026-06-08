-- Restrict sensitive columns from being read by non-managers

-- 1) pricing_plans: hide cost_cents/markup_percent from anon/authenticated
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon, authenticated, PUBLIC;

-- 2) reseller_integrations: hide raw API credentials from anon/authenticated
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon, authenticated, PUBLIC;

-- 3) resellers: anon may only read identifying columns for the public storefront
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;