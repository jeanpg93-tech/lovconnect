
-- 1) claude_orders
REVOKE SELECT (cost_cents, profit_cents) ON public.claude_orders FROM authenticated, anon;

-- 2) claude_plan_prices
REVOKE SELECT (cost_cents) ON public.claude_plan_prices FROM authenticated, anon;

-- 3) orders
REVOKE SELECT (provider_response) ON public.orders FROM authenticated, anon;

-- 4) pricing_plans
REVOKE SELECT (cost_cents) ON public.pricing_plans FROM authenticated, anon;

-- 5) provider_credit_orders
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM authenticated, anon;

-- 6) reseller_credit_purchases
REVOKE SELECT (cost_cents) ON public.reseller_credit_purchases FROM authenticated, anon;

-- 7) reseller_integrations secrets
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated, anon;

-- 8) reseller_recharge_plan_prices
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM authenticated, anon;

-- 9) reseller_recharge_plan_subscriptions
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_subscriptions FROM authenticated, anon;

-- 10) storefront_orders
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated, anon;

-- 11) resellers: anon só pode ler colunas estritamente públicas da loja
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, user_id, display_name, slug, is_active, recharge_plans_enabled, created_at)
  ON public.resellers TO anon;

-- ----------------------------------------------------------------
-- RPCs SECURITY DEFINER apenas para gerentes (mantém UI de gestão funcionando)
-- ----------------------------------------------------------------

-- claude_plan_prices completo (inclui cost_cents)
CREATE OR REPLACE FUNCTION public.admin_claude_plan_prices_full()
RETURNS TABLE (
  id uuid,
  plan_code text,
  cost_cents integer,
  markup_mode text,
  markup_value_cents integer,
  sale_price_cents integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.plan_code, p.cost_cents, p.markup_mode, p.markup_value_cents,
           p.sale_price_cents, p.is_active, p.created_at, p.updated_at
      FROM public.claude_plan_prices p;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_claude_plan_prices_full() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_claude_plan_prices_full() TO authenticated;

-- reseller_credit_purchases custos para analytics do gerente
CREATE OR REPLACE FUNCTION public.admin_reseller_credit_purchases_costs(
  _from timestamptz DEFAULT NULL,
  _to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  cost_cents integer,
  price_cents integer,
  created_at timestamptz,
  reseller_id uuid,
  status text,
  credits integer,
  customer_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT r.id, r.cost_cents, r.price_cents, r.created_at, r.reseller_id, r.status,
           r.credits, r.customer_name
      FROM public.reseller_credit_purchases r
     WHERE (_from IS NULL OR r.created_at >= _from)
       AND (_to   IS NULL OR r.created_at <  _to);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reseller_credit_purchases_costs(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reseller_credit_purchases_costs(timestamptz, timestamptz) TO authenticated;

-- reseller_recharge_plan_subscriptions custos para analytics do gerente
CREATE OR REPLACE FUNCTION public.admin_reseller_recharge_plan_subscriptions_costs(
  _from timestamptz DEFAULT NULL,
  _to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  cost_cents integer,
  plan_id uuid,
  started_at timestamptz,
  created_at timestamptz,
  status text,
  reseller_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT s.cost_cents, s.plan_id, s.started_at, s.created_at, s.status, s.reseller_id
      FROM public.reseller_recharge_plan_subscriptions s
     WHERE (_from IS NULL OR s.created_at >= _from)
       AND (_to   IS NULL OR s.created_at <  _to);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reseller_recharge_plan_subscriptions_costs(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reseller_recharge_plan_subscriptions_costs(timestamptz, timestamptz) TO authenticated;

-- custo sugerido para catálogo de vendas (custo provedor mais recente por créditos)
CREATE OR REPLACE FUNCTION public.admin_recent_provider_cost_by_credits()
RETURNS TABLE (
  credits integer,
  cost_cents integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (r.credits) r.credits, r.cost_cents
      FROM public.reseller_credit_purchases r
     WHERE r.cost_cents IS NOT NULL AND r.cost_cents > 0
     ORDER BY r.credits, r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recent_provider_cost_by_credits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recent_provider_cost_by_credits() TO authenticated;
