
-- Fix EXPOSED_SENSITIVE_DATA on pricing_plans: hide cost_cents and markup_percent from non-gerentes.
-- Revoke column SELECT for authenticated; gerentes already read these via the
-- gerente_list_pricing_plans RPC (SECURITY DEFINER).
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon;

-- Fix EXPOSED_SENSITIVE_DATA on reseller_integrations: revoke client SELECT on credential columns.
-- Edge functions using service_role still have access (e.g. get-my-misticpay-credentials, evolution-api).
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated;
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon;
