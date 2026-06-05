
CREATE OR REPLACE FUNCTION public.trg_whatsapp_profile_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_url text := 'https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/system-whatsapp-notify';
  v_owner_reseller uuid;
  v_owner_name text;
  v_link text := 'https://lovconnect.store/painel';
BEGIN
  IF NEW.approval_status <> 'approved' OR COALESCE(OLD.approval_status,'') = 'approved' THEN
    RETURN NEW;
  END IF;
  SELECT webhook_secret INTO v_secret FROM public.system_whatsapp_settings WHERE singleton = true;
  IF v_secret IS NULL THEN RETURN NEW; END IF;

  -- signup_approved para o próprio usuário
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
      body := jsonb_build_object(
        'mode','auto','event_key','signup_approved','profile_id', NEW.id::text,
        'vars', jsonb_build_object('nome', COALESCE(NEW.display_name,''), 'link', v_link)
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- adesao_available para o próprio usuário (aprovação já libera o pagamento)
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
      body := jsonb_build_object(
        'mode','auto','event_key','adesao_available','profile_id', NEW.id::text,
        'vars', jsonb_build_object('nome', COALESCE(NEW.display_name,''), 'link', v_link, 'valor','')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- referral_approved para o dono do código
  IF NEW.affiliate_code_used IS NOT NULL THEN
    SELECT ac.owner_reseller_id, COALESCE(p.display_name, r.display_name)
      INTO v_owner_reseller, v_owner_name
      FROM public.affiliate_codes ac
      LEFT JOIN public.resellers r ON r.id = ac.owner_reseller_id
      LEFT JOIN public.profiles p ON p.id = r.user_id
      WHERE upper(ac.code) = upper(NEW.affiliate_code_used) LIMIT 1;

    IF v_owner_reseller IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
          body := jsonb_build_object(
            'mode','auto','event_key','referral_approved','reseller_id', v_owner_reseller::text,
            'vars', jsonb_build_object('nome', COALESCE(v_owner_name,''), 'indicado', COALESCE(NEW.display_name, NEW.email,''))
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_profile_approved ON public.profiles;
CREATE TRIGGER trg_whatsapp_profile_approved
AFTER UPDATE OF approval_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_profile_approved();


CREATE OR REPLACE FUNCTION public.trg_whatsapp_reseller_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_url text := 'https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/system-whatsapp-notify';
  v_profile RECORD;
  v_owner_reseller uuid;
  v_owner_name text;
  v_indicado text;
  v_link text := 'https://lovconnect.store/painel';
BEGIN
  IF NEW.activation_status <> 'active' OR COALESCE(OLD.activation_status,'') = 'active' THEN
    RETURN NEW;
  END IF;
  SELECT webhook_secret INTO v_secret FROM public.system_whatsapp_settings WHERE singleton = true;
  IF v_secret IS NULL THEN RETURN NEW; END IF;

  SELECT id, display_name, email, affiliate_code_used INTO v_profile
    FROM public.profiles WHERE id = NEW.user_id;

  -- panel_unlocked para o revendedor
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
      body := jsonb_build_object(
        'mode','auto','event_key','panel_unlocked','reseller_id', NEW.id::text,
        'vars', jsonb_build_object('nome', COALESCE(v_profile.display_name,''), 'link', v_link)
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- referral_paid_activation para o dono do código
  IF v_profile.affiliate_code_used IS NOT NULL THEN
    SELECT ac.owner_reseller_id, COALESCE(p.display_name, r.display_name)
      INTO v_owner_reseller, v_owner_name
      FROM public.affiliate_codes ac
      LEFT JOIN public.resellers r ON r.id = ac.owner_reseller_id
      LEFT JOIN public.profiles p ON p.id = r.user_id
      WHERE upper(ac.code) = upper(v_profile.affiliate_code_used) LIMIT 1;

    IF v_owner_reseller IS NOT NULL THEN
      v_indicado := COALESCE(v_profile.display_name, v_profile.email, '');
      BEGIN
        PERFORM net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
          body := jsonb_build_object(
            'mode','auto','event_key','referral_paid_activation','reseller_id', v_owner_reseller::text,
            'vars', jsonb_build_object('nome', COALESCE(v_owner_name,''), 'indicado', v_indicado)
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_reseller_activated ON public.resellers;
CREATE TRIGGER trg_whatsapp_reseller_activated
AFTER UPDATE OF activation_status ON public.resellers
FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_reseller_activated();
