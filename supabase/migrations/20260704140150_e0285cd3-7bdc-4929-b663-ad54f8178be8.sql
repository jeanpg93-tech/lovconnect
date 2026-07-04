
-- 1) activation_payments.raw_response
REVOKE SELECT (raw_response) ON public.activation_payments FROM authenticated;

-- 2) claude_orders provider secrets
REVOKE SELECT (provider_api_key, provider_response, provider_user_id) ON public.claude_orders FROM authenticated;

CREATE OR REPLACE FUNCTION public.manager_list_claude_manual_orders(_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid,
  plan_code text,
  code text,
  provider_api_key text,
  cost_cents integer,
  created_at timestamptz,
  customer_name text,
  customer_whatsapp text,
  customer_email text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT co.id, co.plan_code::text, co.code, co.provider_api_key, co.cost_cents,
           co.created_at, co.customer_name, co.customer_whatsapp, co.customer_email
      FROM public.claude_orders co
     WHERE co.is_manager_manual = true
       AND co.code IS NOT NULL
     ORDER BY co.created_at DESC
     LIMIT COALESCE(_limit, 200);
END;
$$;
GRANT EXECUTE ON FUNCTION public.manager_list_claude_manual_orders(integer) TO authenticated;

-- 3) orders.provider_response
REVOKE SELECT (provider_response) ON public.orders FROM authenticated;

-- 4) reseller_credit_purchases.cost_cents
REVOKE SELECT (cost_cents) ON public.reseller_credit_purchases FROM authenticated;

-- 5) reseller_integrations secrets
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated;

-- 6) storefront_orders.raw_response
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated;

-- 7) resellers anon — restrição real por coluna
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;

DROP POLICY IF EXISTS "Anon ve revendedores ativos (colunas restritas)" ON public.resellers;
CREATE POLICY "Anon vê revendedores ativos (colunas públicas)"
  ON public.resellers FOR SELECT
  TO anon
  USING (is_active = true);
