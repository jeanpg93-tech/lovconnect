
CREATE OR REPLACE FUNCTION public.get_pack_commitments()
RETURNS TABLE(committed_credits bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(credits), 0)::bigint AS committed_credits
  FROM public.reseller_pack_balances;
$$;

GRANT EXECUTE ON FUNCTION public.get_pack_commitments() TO authenticated, service_role;
