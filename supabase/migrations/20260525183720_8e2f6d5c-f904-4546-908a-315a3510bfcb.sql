
ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_last_state TEXT;

ALTER TABLE public.telegram_settings
  ADD COLUMN IF NOT EXISTS notify_delivery_progress BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.trg_telegram_delivery_progress_recharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_chat bigint;
  v_on boolean;
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR COALESCE(OLD.error_message,'') IS DISTINCT FROM COALESCE(NEW.error_message,'')
       OR COALESCE(OLD.workspace_name,'') IS DISTINCT FROM COALESCE(NEW.workspace_name,'')
       OR COALESCE(OLD.email_conta_lovable,'') IS DISTINCT FROM COALESCE(NEW.email_conta_lovable,'')
       OR COALESCE(OLD.cancellation_status,'') IS DISTINCT FROM COALESCE(NEW.cancellation_status,'') THEN
      v_changed := true;
    END IF;
  END IF;

  IF NOT v_changed THEN RETURN NEW; END IF;

  SELECT chat_id, notify_delivery_progress INTO v_chat, v_on
    FROM public.telegram_settings WHERE id = 1;
  IF v_chat IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(v_on, true) THEN RETURN NEW; END IF;

  v_url := 'https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/telegram-delivery-progress';

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('purchaseId', NEW.id),
    headers := jsonb_build_object('Content-Type','application/json')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_telegram_delivery_progress_recharge ON public.reseller_credit_purchases;
CREATE TRIGGER trg_telegram_delivery_progress_recharge
AFTER INSERT OR UPDATE ON public.reseller_credit_purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_delivery_progress_recharge();
