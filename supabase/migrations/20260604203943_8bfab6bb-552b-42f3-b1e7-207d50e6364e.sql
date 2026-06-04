
-- Pricing plans: hide internal cost/markup from regular users
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon;

-- Reseller integrations: hide credential columns from clients
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated;
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon;

-- Resellers: remove broad authenticated visibility of all rows/columns.
-- Managers retain access via gerente policy; owners via self policy; anon via existing column-restricted policy.
DROP POLICY IF EXISTS "Authenticated ve revendedores ativos" ON public.resellers;

-- Extension versions: hide internal storage paths from anonymous visitors.
REVOKE SELECT (file_path, file_name, file_size) ON public.extension_versions FROM anon;
