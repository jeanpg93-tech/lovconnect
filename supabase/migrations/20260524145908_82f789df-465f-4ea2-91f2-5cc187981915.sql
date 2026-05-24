
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Update handle_new_user to capture whatsapp from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _aff_code TEXT;
  _aff RECORD;
  _name TEXT;
  _wa TEXT;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  _aff_code := NULLIF(trim(NEW.raw_user_meta_data->>'affiliate_code'), '');
  _wa := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'whatsapp',''), '\D', '', 'g'), '');

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
