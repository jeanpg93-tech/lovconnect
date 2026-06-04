
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, slug, display_name, is_active) ON public.resellers TO anon;
