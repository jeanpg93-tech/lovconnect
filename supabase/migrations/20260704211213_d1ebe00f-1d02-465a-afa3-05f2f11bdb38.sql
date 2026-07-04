CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _aff_code TEXT;
  _aff RECORD;
  _name TEXT;
  _wa TEXT;
  _is_claude_customer BOOLEAN;
BEGIN
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  _aff_code := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'affiliate_code', '')), '');
  _wa := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'whatsapp',''), '\D', '', 'g'), '');
  _is_claude_customer := COALESCE((NEW.raw_user_meta_data->>'claude_customer')::boolean, false);

  IF _is_claude_customer THEN
    INSERT INTO public.profiles (id, email, display_name, approval_status, whatsapp)
    VALUES (NEW.id, NEW.email, _name, 'approved', _wa)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
      approval_status = 'approved',
      whatsapp = COALESCE(public.profiles.whatsapp, EXCLUDED.whatsapp),
      updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN NEW;
  END IF;

  IF _aff_code IS NULL THEN
    RAISE EXCEPTION 'Código de afiliado obrigatório';
  END IF;

  SELECT * INTO _aff FROM public.affiliate_codes
  WHERE upper(code) = upper(_aff_code)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses < max_uses)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de afiliado inválido ou expirado';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, approval_status, affiliate_code_used, whatsapp)
  VALUES (NEW.id, NEW.email, _name, 'pending', upper(_aff_code), _wa);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;