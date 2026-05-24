
-- 1. activation_status em resellers
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS activation_status TEXT NOT NULL DEFAULT 'active'
  CHECK (activation_status IN ('awaiting_payment','payment_under_review','active','payment_rejected'));

CREATE INDEX IF NOT EXISTS idx_resellers_activation_status ON public.resellers(activation_status);

-- Grandfather: todos atuais já entraram como 'active' por default.

-- 2. activation_payments
CREATE TABLE IF NOT EXISTS public.activation_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL DEFAULT 20000,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','under_review','approved','rejected','cancelled')),
  provider TEXT NOT NULL DEFAULT 'misticpay',
  provider_transaction_id TEXT,
  qr_code_base64 TEXT,
  copy_paste TEXT,
  expires_at TIMESTAMPTZ,
  proof_url TEXT,
  proof_note TEXT,
  reviewer_id UUID,
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_payments_reseller ON public.activation_payments(reseller_id);
CREATE INDEX IF NOT EXISTS idx_activation_payments_status ON public.activation_payments(status);
CREATE INDEX IF NOT EXISTS idx_activation_payments_tx ON public.activation_payments(provider_transaction_id);

CREATE TRIGGER activation_payments_updated_at
  BEFORE UPDATE ON public.activation_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.activation_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus pagamentos de ativação"
  ON public.activation_payments FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos pagamentos de ativação"
  ON public.activation_payments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia pagamentos de ativação"
  ON public.activation_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

-- 3. activation_logs
CREATE TABLE IF NOT EXISTS public.activation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_logs_reseller ON public.activation_logs(reseller_id);

ALTER TABLE public.activation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus logs"
  ON public.activation_logs FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos logs"
  ON public.activation_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente cria logs"
  ON public.activation_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

-- 4. Bucket privado para comprovantes
INSERT INTO storage.buckets (id, name, public)
  VALUES ('activation-proofs', 'activation-proofs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Revendedor lê seu próprio comprovante"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'activation-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Revendedor envia comprovante para si"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activation-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Gerente lê todos comprovantes"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'activation-proofs' AND has_role(auth.uid(), 'gerente'::app_role));

-- 5. RPC activate_reseller
CREATE OR REPLACE FUNCTION public.activate_reseller(_reseller_id UUID, _payment_id UUID DEFAULT NULL, _actor_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bronze UUID;
BEGIN
  SELECT id INTO _bronze FROM public.reseller_tiers WHERE slug = 'bronze' LIMIT 1;

  UPDATE public.resellers
    SET activation_status = 'active',
        is_active = true,
        bonus_min_tier_id = COALESCE(bonus_min_tier_id, _bronze),
        updated_at = now()
    WHERE id = _reseller_id;

  IF _payment_id IS NOT NULL THEN
    UPDATE public.activation_payments
      SET status = 'approved',
          activated_at = now(),
          updated_at = now()
      WHERE id = _payment_id AND status <> 'approved';
  END IF;

  INSERT INTO public.activation_logs (reseller_id, event, actor_id, metadata)
    VALUES (_reseller_id, 'activated', _actor_id, jsonb_build_object('payment_id', _payment_id));
END;
$$;

REVOKE ALL ON FUNCTION public.activate_reseller(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_reseller(UUID, UUID, UUID) TO authenticated, service_role;

-- 6. Helper: is_reseller_active(user_id)
CREATE OR REPLACE FUNCTION public.is_reseller_active(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.resellers
    WHERE user_id = _user_id
      AND activation_status = 'active'
      AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_reseller_active(UUID) TO authenticated, service_role, anon;

-- 7. Atualiza approve_user: novos revendedores entram em awaiting_payment
CREATE OR REPLACE FUNCTION public.approve_user(_user_id UUID)
RETURNS VOID
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

  -- AGORA: cria reseller em estado awaiting_payment (preview limitado)
  INSERT INTO public.resellers (user_id, display_name, slug, is_active, activation_status)
    VALUES (_user_id, _name, _slug, true, 'awaiting_payment')
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

  -- log
  IF _new_reseller_id IS NOT NULL THEN
    INSERT INTO public.activation_logs (reseller_id, event, actor_id)
      VALUES (_new_reseller_id, 'approved_by_manager', auth.uid());
  END IF;
END;
$$;
