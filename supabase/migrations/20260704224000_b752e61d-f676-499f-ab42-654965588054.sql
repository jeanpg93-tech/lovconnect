
REVOKE SELECT (provider_api_key) ON public.claude_orders FROM authenticated, anon;
REVOKE SELECT (provider_response) ON public.orders FROM authenticated, anon;
REVOKE SELECT (email_convite_bot) ON public.provider_credit_orders FROM authenticated, anon;
REVOKE SELECT (raw_response) ON public.storefront_orders FROM authenticated, anon;
REVOKE SELECT (provider_response) ON public.reseller_credit_purchases FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_claude_order_api_key(_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_reseller uuid;
BEGIN
  SELECT provider_api_key, reseller_id INTO v_key, v_reseller
    FROM public.claude_orders WHERE id = _order_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;
  IF public.has_role(auth.uid(), 'gerente'::app_role) THEN RETURN v_key; END IF;
  IF v_reseller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.resellers WHERE id = v_reseller AND user_id = auth.uid()
  ) THEN
    RETURN v_key;
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.get_claude_order_api_key(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_credit_purchases_by_status(
  _statuses text[],
  _limit int DEFAULT 200
) RETURNS SETOF public.reseller_credit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.reseller_credit_purchases
     WHERE status = ANY(_statuses)
     ORDER BY updated_at DESC
     LIMIT _limit;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_credit_purchases_by_status(text[], int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_manual_credit_purchases(_limit int DEFAULT 500)
RETURNS SETOF public.reseller_credit_purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.reseller_credit_purchases
     WHERE provider_response @> '{"manual": true}'::jsonb
     ORDER BY created_at DESC
     LIMIT _limit;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_manual_credit_purchases(int) TO authenticated;
