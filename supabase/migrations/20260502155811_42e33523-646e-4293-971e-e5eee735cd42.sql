CREATE TABLE public.affiliate_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê códigos de afiliado"
  ON public.affiliate_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente cria códigos de afiliado"
  ON public.affiliate_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza códigos de afiliado"
  ON public.affiliate_codes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove códigos de afiliado"
  ON public.affiliate_codes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER affiliate_codes_set_updated_at
BEFORE UPDATE ON public.affiliate_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1º: unaccent_safe
CREATE OR REPLACE FUNCTION public.unaccent_safe(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(_s,
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  );
$$;

-- 2º: slugify usa unaccent_safe
CREATE OR REPLACE FUNCTION public._slugify_simple(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      lower(public.unaccent_safe(_s)),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reseller_id UUID;
  _aff_code TEXT;
  _aff RECORD;
  _slug TEXT;
  _base_slug TEXT;
  _i INT := 0;
  _name TEXT;
BEGIN
  _name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  BEGIN
    _reseller_id := NULLIF(NEW.raw_user_meta_data->>'reseller_id', '')::UUID;
  EXCEPTION WHEN others THEN
    _reseller_id := NULL;
  END;

  IF _reseller_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resellers WHERE id = _reseller_id AND is_active = true
    ) THEN
      _reseller_id := NULL;
    END IF;
  END IF;

  _aff_code := NULLIF(trim(NEW.raw_user_meta_data->>'affiliate_code'), '');

  INSERT INTO public.profiles (id, email, display_name, reseller_id)
  VALUES (NEW.id, NEW.email, _name, _reseller_id);

  IF _aff_code IS NOT NULL THEN
    SELECT * INTO _aff FROM public.affiliate_codes
    WHERE upper(code) = upper(_aff_code)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses < max_uses)
    LIMIT 1;

    IF FOUND THEN
      _base_slug := public._slugify_simple(_name);
      IF _base_slug IS NULL OR _base_slug = '' THEN _base_slug := 'revendedor'; END IF;
      _slug := _base_slug;
      WHILE EXISTS (SELECT 1 FROM public.resellers WHERE slug = _slug) LOOP
        _i := _i + 1;
        _slug := _base_slug || '-' || _i;
      END LOOP;

      INSERT INTO public.resellers (user_id, display_name, slug, is_active)
      VALUES (NEW.id, _name, _slug, true);

      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'revendedor')
      ON CONFLICT DO NOTHING;

      UPDATE public.affiliate_codes
        SET uses = uses + 1, updated_at = now()
        WHERE id = _aff.id;

      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();