
CREATE OR REPLACE FUNCTION public.trg_whatsapp_new_signup()
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
BEGIN
  IF NEW.approval_status <> 'pending' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.whatsapp,'') = '' THEN RETURN NEW; END IF;

  SELECT webhook_secret INTO v_secret FROM public.system_whatsapp_settings WHERE singleton = true;
  IF v_secret IS NULL THEN RETURN NEW; END IF;

  -- 1) signup_received para o próprio novo cadastro
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
      body := jsonb_build_object(
        'mode','auto',
        'event_key','signup_received',
        'profile_id', NEW.id::text,
        'vars', jsonb_build_object('nome', COALESCE(NEW.display_name,''), 'loja','LovConnect')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 2) referral_new_signup para o dono do código
  IF NEW.affiliate_code_used IS NOT NULL THEN
    SELECT ac.owner_reseller_id, COALESCE(p.display_name, r.display_name)
      INTO v_owner_reseller, v_owner_name
      FROM public.affiliate_codes ac
      LEFT JOIN public.resellers r ON r.id = ac.owner_reseller_id
      LEFT JOIN public.profiles p ON p.id = r.user_id
      WHERE upper(ac.code) = upper(NEW.affiliate_code_used)
      LIMIT 1;

    IF v_owner_reseller IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type','application/json','x-system-secret', v_secret),
          body := jsonb_build_object(
            'mode','auto',
            'event_key','referral_new_signup',
            'reseller_id', v_owner_reseller::text,
            'vars', jsonb_build_object(
              'nome', COALESCE(v_owner_name,''),
              'indicado', COALESCE(NEW.display_name, NEW.email,''),
              'codigo', NEW.affiliate_code_used
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_new_signup ON public.profiles;
CREATE TRIGGER trg_whatsapp_new_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_new_signup();
