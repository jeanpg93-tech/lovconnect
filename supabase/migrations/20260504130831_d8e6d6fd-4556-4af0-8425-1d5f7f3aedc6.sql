
-- 1. Comissão por nível
ALTER TABLE public.reseller_tiers
  ADD COLUMN IF NOT EXISTS referral_commission_percent NUMERIC NOT NULL DEFAULT 0;

-- 2. Dono do código (NULL = código do gerente)
ALTER TABLE public.affiliate_codes
  ADD COLUMN IF NOT EXISTS owner_reseller_id UUID;

CREATE INDEX IF NOT EXISTS idx_affiliate_codes_owner ON public.affiliate_codes(owner_reseller_id);

-- 3. Tabela de indicações
CREATE TABLE IF NOT EXISTS public.reseller_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_reseller_id UUID NOT NULL,
  referred_reseller_id UUID NOT NULL UNIQUE,
  affiliate_code TEXT NOT NULL,
  total_commission_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_referrals_referrer ON public.reseller_referrals(referrer_reseller_id);

ALTER TABLE public.reseller_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê todas indicações"
  ON public.reseller_referrals FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor vê suas indicações"
  ON public.reseller_referrals FOR SELECT TO authenticated
  USING (referrer_reseller_id IN (SELECT id FROM resellers WHERE user_id = auth.uid()));

-- 4. Atualizar approve_user para registrar referral
CREATE OR REPLACE FUNCTION public.approve_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile RECORD;
  _name TEXT;
  _base TEXT;
  _slug TEXT;
  _i INT := 0;
  _aff RECORD;
  _new_reseller_id UUID;
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
    ON CONFLICT DO NOTHING
    RETURNING id INTO _new_reseller_id;

  IF _new_reseller_id IS NULL THEN
    SELECT id INTO _new_reseller_id FROM public.resellers WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'revendedor')
    ON CONFLICT DO NOTHING;

  IF _profile.affiliate_code_used IS NOT NULL THEN
    UPDATE public.affiliate_codes
      SET uses = uses + 1, updated_at = now()
      WHERE upper(code) = upper(_profile.affiliate_code_used);

    SELECT * INTO _aff FROM public.affiliate_codes
      WHERE upper(code) = upper(_profile.affiliate_code_used) LIMIT 1;

    IF _aff.owner_reseller_id IS NOT NULL AND _new_reseller_id IS NOT NULL THEN
      INSERT INTO public.reseller_referrals (referrer_reseller_id, referred_reseller_id, affiliate_code)
        VALUES (_aff.owner_reseller_id, _new_reseller_id, _aff.code)
        ON CONFLICT (referred_reseller_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.profiles
    SET approval_status = 'approved', updated_at = now()
    WHERE id = _user_id;
END;
$function$;

-- 5. Função para gerar código aleatório do revendedor
CREATE OR REPLACE FUNCTION public.generate_reseller_referral_code(_reseller_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code TEXT;
  _exists BOOLEAN;
  _attempts INT := 0;
BEGIN
  -- já tem?
  SELECT code INTO _code FROM public.affiliate_codes
    WHERE owner_reseller_id = _reseller_id LIMIT 1;
  IF _code IS NOT NULL THEN RETURN _code; END IF;

  LOOP
    _code := 'REV-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.affiliate_codes WHERE upper(code) = _code) INTO _exists;
    EXIT WHEN NOT _exists OR _attempts > 20;
    _attempts := _attempts + 1;
  END LOOP;

  INSERT INTO public.affiliate_codes (code, label, owner_reseller_id, is_active)
    VALUES (_code, 'Indicação automática', _reseller_id, true);

  RETURN _code;
END;
$$;

-- 6. Trigger: ao criar revendedor, gera código automaticamente
CREATE OR REPLACE FUNCTION public.trg_create_reseller_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_reseller_referral_code(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reseller_auto_referral_code ON public.resellers;
CREATE TRIGGER reseller_auto_referral_code
  AFTER INSERT ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.trg_create_reseller_code();

-- 7. Backfill para revendedores existentes
DO $$
DECLARE _r RECORD;
BEGIN
  FOR _r IN SELECT id FROM public.resellers WHERE id NOT IN (SELECT owner_reseller_id FROM public.affiliate_codes WHERE owner_reseller_id IS NOT NULL) LOOP
    PERFORM public.generate_reseller_referral_code(_r.id);
  END LOOP;
END $$;

-- 8. Permitir que revendedor veja códigos de afiliado que pertencem a ele
CREATE POLICY "Revendedor vê seu código de indicação"
  ON public.affiliate_codes FOR SELECT TO authenticated
  USING (owner_reseller_id IN (SELECT id FROM resellers WHERE user_id = auth.uid()));
