-- Revoke SELECT on sensitive cost/margin columns from authenticated and anon

REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM PUBLIC;

REVOKE SELECT (platform_cost_cents) ON public.recharge_plans FROM authenticated;
REVOKE SELECT (platform_cost_cents) ON public.recharge_plans FROM anon;
REVOKE SELECT (platform_cost_cents) ON public.recharge_plans FROM PUBLIC;

-- Reseller integration secrets: revoke client-side reads
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated;
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon;
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM PUBLIC;

-- Resellers: anon should only see the 5 public columns
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active, recharge_plans_enabled)
  ON public.resellers TO anon;