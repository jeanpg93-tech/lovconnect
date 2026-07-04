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
  cancelled_at timestamptz
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
           co.cancelled_at
      FROM public.claude_orders co
     WHERE co.is_manager_manual = true
       AND co.code IS NOT NULL
     ORDER BY co.created_at DESC
     LIMIT COALESCE(_limit, 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_list_claude_manual_orders(integer) TO authenticated;