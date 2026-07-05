
-- 1) claude_customers: adicionar WITH CHECK bloqueando troca de reseller_id/auth_user_id
DROP POLICY IF EXISTS "claude_customers reseller update own" ON public.claude_customers;
CREATE POLICY "claude_customers reseller update own"
ON public.claude_customers FOR UPDATE
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()))
WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "claude_customers self update" ON public.claude_customers;
CREATE POLICY "claude_customers self update"
ON public.claude_customers FOR UPDATE
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- Trigger: cliente/revendedor não podem alterar reseller_id nem auth_user_id
-- (apenas gerente/service_role via SECURITY DEFINER conseguem).
CREATE OR REPLACE FUNCTION public.claude_customers_lock_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'gerente') THEN
    RETURN NEW;
  END IF;
  IF NEW.reseller_id IS DISTINCT FROM OLD.reseller_id THEN
    RAISE EXCEPTION 'reseller_id não pode ser alterado';
  END IF;
  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'auth_user_id não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claude_customers_lock_owner_fields ON public.claude_customers;
CREATE TRIGGER trg_claude_customers_lock_owner_fields
BEFORE UPDATE ON public.claude_customers
FOR EACH ROW EXECUTE FUNCTION public.claude_customers_lock_owner_fields();

-- 2) claude_orders: remover INSERT direto do revendedor (só edge functions com service_role inserem)
DROP POLICY IF EXISTS "claude_orders reseller insert own" ON public.claude_orders;

-- 3) handle_new_user: só aceita claude_customer=true quando vier com reseller_id válido
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _aff_code TEXT;
  _aff RECORD;
  _name TEXT;
  _wa TEXT;
  _is_claude_customer BOOLEAN;
  _reseller_id_meta UUID;
  _reseller_ok BOOLEAN := false;
BEGIN
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  _aff_code := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'affiliate_code', '')), '');
  _wa := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'whatsapp',''), '\D', '', 'g'), '');
  _is_claude_customer := COALESCE((NEW.raw_user_meta_data->>'claude_customer')::boolean, false);

  -- Só confia na flag claude_customer se vier com um reseller_id válido.
  IF _is_claude_customer THEN
    BEGIN
      _reseller_id_meta := NULLIF(NEW.raw_user_meta_data->>'reseller_id','')::uuid;
    EXCEPTION WHEN others THEN
      _reseller_id_meta := NULL;
    END;
    IF _reseller_id_meta IS NOT NULL THEN
      SELECT true INTO _reseller_ok FROM public.resellers
       WHERE id = _reseller_id_meta AND is_active = true AND claude_enabled = true
       LIMIT 1;
    END IF;
  END IF;

  IF _is_claude_customer AND _reseller_ok THEN
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
$function$;
