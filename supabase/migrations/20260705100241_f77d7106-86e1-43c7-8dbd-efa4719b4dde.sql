DROP FUNCTION IF EXISTS public.manager_list_claude_manual_orders(integer);

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
  customer_email text,
  status text,
  cancelled_at timestamptz,
  is_trial boolean,
  reseller_id uuid,
  reseller_display_name text,
  origin text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT co.id,
           co.plan_code::text,
           co.code,
           co.provider_api_key,
           co.cost_cents,
           co.created_at,
           co.customer_name,
           co.customer_whatsapp,
           co.customer_email,
           co.status::text,
           co.cancelled_at,
           COALESCE(co.is_trial, false) AS is_trial,
           co.reseller_id,
           r.display_name AS reseller_display_name,
           CASE
             WHEN co.is_manager_manual THEN 'gerente'
             WHEN co.is_trial AND co.error_message = 'trial_storefront' THEN 'storefront'
             WHEN co.is_trial AND co.reseller_id IS NOT NULL THEN 'revendedor'
             WHEN co.reseller_id IS NOT NULL THEN 'revendedor'
             ELSE 'outro'
           END AS origin
      FROM public.claude_orders co
      LEFT JOIN public.resellers r ON r.id = co.reseller_id
     WHERE (co.is_manager_manual = true OR COALESCE(co.is_trial, false) = true)
       AND co.code IS NOT NULL
     ORDER BY co.created_at DESC
     LIMIT COALESCE(_limit, 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_list_claude_manual_orders(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.manager_list_claude_manual_orders(integer) FROM PUBLIC, anon;