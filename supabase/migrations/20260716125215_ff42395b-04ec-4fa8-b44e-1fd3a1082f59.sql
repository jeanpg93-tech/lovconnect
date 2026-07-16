
CREATE OR REPLACE FUNCTION public.is_system_in_maintenance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
     FROM public.app_settings
     WHERE key = 'system.maintenance'
     LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_system_in_maintenance() TO anon, authenticated, service_role;
