GRANT SELECT ON public.license_packs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.license_packs TO authenticated;
GRANT ALL ON public.license_packs TO service_role;