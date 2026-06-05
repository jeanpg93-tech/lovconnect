
-- Helper: dispatch event via pg_net to system-whatsapp-notify
CREATE OR REPLACE FUNCTION public.dispatch_system_whatsapp_event(
  _event_key text,
  _reseller_id uuid,
  _vars jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT webhook_secret INTO v_secret FROM public.system_whatsapp_settings WHERE singleton = true LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := 'https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/system-whatsapp-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-system-secret', v_secret,
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZW1rb2ZrZWxldWhqaWZ2YXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTkwMDMsImV4cCI6MjA5NDg5NTAwM30.aQFQh9lizvdslW9eqJM_e8ikv2MPPnCWp8jjVnTUp2w'
    ),
    body := jsonb_build_object(
      'mode', 'auto',
      'event_key', _event_key,
      'reseller_id', _reseller_id,
      'vars', _vars
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch_system_whatsapp_event failed: %', SQLERRM;
END;
$$;

-- Trigger 1: signup_received — novo perfil criado, busca o reseller correspondente
CREATE OR REPLACE FUNCTION public.trg_system_whatsapp_signup_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reseller_id uuid;
BEGIN
  -- find reseller for this user (may not exist yet if created later)
  SELECT id INTO v_reseller_id FROM public.resellers WHERE user_id = NEW.id LIMIT 1;
  IF v_reseller_id IS NULL THEN
    -- defer: when resellers row is created we'll catch via the resellers trigger below
    RETURN NEW;
  END IF;
  PERFORM public.dispatch_system_whatsapp_event(
    'signup_received', v_reseller_id,
    jsonb_build_object('nome', COALESCE(NEW.display_name, ''))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sys_wa_signup_received_profiles ON public.profiles;
CREATE TRIGGER trg_sys_wa_signup_received_profiles
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_system_whatsapp_signup_received();

-- Fallback: also catch when resellers row is created (profile may exist before reseller)
CREATE OR REPLACE FUNCTION public.trg_system_whatsapp_reseller_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT COALESCE(display_name, '') INTO v_name FROM public.profiles WHERE id = NEW.user_id LIMIT 1;
  PERFORM public.dispatch_system_whatsapp_event(
    'signup_received', NEW.id,
    jsonb_build_object('nome', COALESCE(v_name, NEW.display_name, ''))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sys_wa_signup_received_resellers ON public.resellers;
CREATE TRIGGER trg_sys_wa_signup_received_resellers
  AFTER INSERT ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.trg_system_whatsapp_reseller_created();

-- Trigger 2: signup_approved — profile approval_status -> 'approved'
CREATE OR REPLACE FUNCTION public.trg_system_whatsapp_signup_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reseller_id uuid;
BEGIN
  IF NEW.approval_status = 'approved' AND COALESCE(OLD.approval_status, '') <> 'approved' THEN
    SELECT id INTO v_reseller_id FROM public.resellers WHERE user_id = NEW.id LIMIT 1;
    IF v_reseller_id IS NOT NULL THEN
      PERFORM public.dispatch_system_whatsapp_event(
        'signup_approved', v_reseller_id,
        jsonb_build_object(
          'nome', COALESCE(NEW.display_name, ''),
          'link', 'https://lovconnect.store/painel/revendedor'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sys_wa_signup_approved_profiles ON public.profiles;
CREATE TRIGGER trg_sys_wa_signup_approved_profiles
  AFTER UPDATE OF approval_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_system_whatsapp_signup_approved();
