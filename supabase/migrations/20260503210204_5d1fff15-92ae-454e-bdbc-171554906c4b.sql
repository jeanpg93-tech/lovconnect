
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS affiliate_code_used text;

CREATE POLICY "Gerente atualiza perfis"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _aff_code TEXT;
  _aff RECORD;
  _name TEXT;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  _aff_code := NULLIF(trim(NEW.raw_user_meta_data->>'affiliate_code'), '');

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

  INSERT INTO public.profiles (id, email, display_name, approval_status, affiliate_code_used)
  VALUES (NEW.id, NEW.email, _name, 'pending', upper(_aff_code));

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile RECORD;
  _name TEXT;
  _base TEXT;
  _slug TEXT;
  _i INT := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF _profile.approval_status = 'approved' THEN RETURN; END IF;

  _name := COALESCE(_profile.display_name, split_part(_profile.email, '@', 1));
  _base := public._slugify_simple(_name);
  IF _base IS NULL OR _base = '' THEN _base := 'revendedor'; END IF;
  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM public.resellers WHERE slug = _slug) LOOP
    _i := _i + 1;
    _slug := _base || '-' || _i;
  END LOOP;

  INSERT INTO public.resellers (user_id, display_name, slug, is_active)
    VALUES (_user_id, _name, _slug, true)
    ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'revendedor')
    ON CONFLICT DO NOTHING;

  IF _profile.affiliate_code_used IS NOT NULL THEN
    UPDATE public.affiliate_codes
      SET uses = uses + 1, updated_at = now()
      WHERE upper(code) = upper(_profile.affiliate_code_used);
  END IF;

  UPDATE public.profiles
    SET approval_status = 'approved', updated_at = now()
    WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
    SET approval_status = 'rejected', updated_at = now()
    WHERE id = _user_id;
END;
$$;
