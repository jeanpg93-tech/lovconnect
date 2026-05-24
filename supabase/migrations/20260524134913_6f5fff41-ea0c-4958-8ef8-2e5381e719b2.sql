
CREATE OR REPLACE FUNCTION public.lookup_affiliate_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code record;
  v_reseller record;
BEGIN
  SELECT id, code, owner_reseller_id, description, is_active, expires_at
    INTO v_code
    FROM public.affiliate_codes
   WHERE upper(code) = upper(trim(_code))
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_code.is_active = false OR (v_code.expires_at IS NOT NULL AND v_code.expires_at < now()) THEN
    RETURN jsonb_build_object('found', false, 'expired', true);
  END IF;

  IF v_code.owner_reseller_id IS NOT NULL THEN
    SELECT display_name INTO v_reseller
      FROM public.resellers
     WHERE id = v_code.owner_reseller_id
     LIMIT 1;
    RETURN jsonb_build_object(
      'found', true,
      'type', 'reseller',
      'owner_name', COALESCE(v_reseller.display_name, 'Revendedor')
    );
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'type', 'campaign',
    'description', COALESCE(v_code.description, 'Campanha')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_affiliate_code(text) TO anon, authenticated;
