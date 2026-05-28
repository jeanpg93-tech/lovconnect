
-- 1) resellers: column-level grant for anon (hide user_id and internal fields)
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active, activation_status, created_at) ON public.resellers TO anon;

-- 2) reseller_storefronts: only enabled stores visible publicly; owners and managers retain access
DROP POLICY IF EXISTS "Public can view storefronts" ON public.reseller_storefronts;
CREATE POLICY "Public can view enabled storefronts"
  ON public.reseller_storefronts FOR SELECT
  TO anon, authenticated
  USING (is_enabled = true);

CREATE POLICY "Owner can view own storefront"
  ON public.reseller_storefronts FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todas lojas"
  ON public.reseller_storefronts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

-- 3) app_settings: hide sensitive credential keys from regular authenticated users
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
CREATE POLICY "Authenticated can read non-sensitive settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (key NOT IN (
    'misticpay_client_id',
    'misticpay_client_secret',
    'lovable_credits_master',
    'lovax_api_token',
    'lovax_base_url'
  ));

-- 4) trial_registrations: allow managers to delete + retention helper
CREATE POLICY "Gerente pode apagar trial registrations"
  ON public.trial_registrations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE OR REPLACE FUNCTION public.cleanup_old_trial_registrations(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH d AS (
    DELETE FROM public.trial_registrations
    WHERE created_at < now() - make_interval(days => GREATEST(_days, 1))
    RETURNING 1
  )
  SELECT count(*)::int INTO _deleted FROM d;
  RETURN _deleted;
END;
$$;
