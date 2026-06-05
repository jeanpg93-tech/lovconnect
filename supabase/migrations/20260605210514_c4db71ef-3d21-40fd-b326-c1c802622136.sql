-- Fix EXPOSED_SENSITIVE_DATA: hide internal cost/markup on pricing_plans from non-managers
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon, authenticated;

-- Fix EXPOSED_SENSITIVE_DATA: hide API credentials on reseller_integrations from any client read
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon, authenticated;