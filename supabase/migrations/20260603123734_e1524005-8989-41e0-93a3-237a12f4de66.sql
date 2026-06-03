-- 1. license_base_costs: restringir leitura ao gerente
DROP POLICY IF EXISTS "Autenticados leem custos base de licença" ON public.license_base_costs;
CREATE POLICY "Gerente lê custos base de licença"
  ON public.license_base_costs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

-- 2. pricing_plans: revogar SELECT amplo e conceder só colunas não sensíveis
REVOKE ALL ON public.pricing_plans FROM PUBLIC;
REVOKE ALL ON public.pricing_plans FROM anon;
REVOKE ALL ON public.pricing_plans FROM authenticated;

GRANT SELECT (
  id, license_type, label, price_cents, pricing_mode, is_active,
  created_at, updated_at, min_price_cents, customer_price_cents
) ON public.pricing_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_plans TO authenticated;

GRANT SELECT (
  id, license_type, label, price_cents, customer_price_cents, is_active
) ON public.pricing_plans TO anon;

GRANT ALL ON public.pricing_plans TO service_role;

-- RPC para gerente ler linhas completas (incl. cost_cents, markup_percent)
CREATE OR REPLACE FUNCTION public.gerente_list_pricing_plans()
RETURNS SETOF public.pricing_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.pricing_plans
  WHERE has_role(auth.uid(), 'gerente'::app_role)
$$;
GRANT EXECUTE ON FUNCTION public.gerente_list_pricing_plans() TO authenticated;

-- 3. reseller_integrations: revogar SELECT amplo, ocultar credenciais
REVOKE ALL ON public.reseller_integrations FROM PUBLIC;
REVOKE ALL ON public.reseller_integrations FROM anon;
REVOKE ALL ON public.reseller_integrations FROM authenticated;

GRANT SELECT (
  reseller_id, misticpay_enabled, evolution_enabled, evolution_base_url,
  evolution_instance, evolution_message_template, evolution_confirmation_template,
  evolution_template_recharge, evolution_template_storefront,
  created_at, updated_at, instance_name, connection_status,
  last_connected_at, messages_sent_count, profile_name,
  profile_picture_url, profile_number, lovable_credits_enabled
) ON public.reseller_integrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reseller_integrations TO authenticated;

GRANT ALL ON public.reseller_integrations TO service_role;

-- 4. tier_license_prices: trocar política aberta por escopo (gerente OU revendedor autenticado)
-- Mantemos visibilidade aos revendedores autenticados (necessária para a tabela de preços por nível),
-- apenas removendo o uso de USING:true e exigindo autenticação real via auth.uid().
DROP POLICY IF EXISTS "Autenticados leem custos de licença" ON public.tier_license_prices;
CREATE POLICY "Revendedor autenticado lê preços ativos por nível"
  ON public.tier_license_prices
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::app_role)
    OR (
      is_active = true
      AND EXISTS (
        SELECT 1 FROM public.resellers r
        WHERE r.user_id = auth.uid() AND r.is_active = true
      )
    )
  );