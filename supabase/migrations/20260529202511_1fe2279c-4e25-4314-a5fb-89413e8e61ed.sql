
DROP TRIGGER IF EXISTS trg_promotions_audit ON public.promotions;

CREATE OR REPLACE FUNCTION public.tg_promotions_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_promotions_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := CASE WHEN NEW.status = 'active' THEN 'activated' ELSE 'created' END;
    INSERT INTO public.promotion_logs (promotion_id, event, details, actor_id)
    VALUES (NEW.id, v_event, jsonb_build_object('name', NEW.name, 'status', NEW.status), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event := CASE NEW.status
        WHEN 'active' THEN 'activated'
        WHEN 'ended' THEN 'ended'
        WHEN 'paused' THEN 'deactivated'
        WHEN 'scheduled' THEN 'scheduled'
        ELSE 'edited'
      END;
      v_details := jsonb_build_object('from', OLD.status, 'to', NEW.status, 'name', NEW.name);
      INSERT INTO public.promotion_logs (promotion_id, event, details, actor_id)
      VALUES (NEW.id, v_event, v_details, auth.uid());
    ELSE
      INSERT INTO public.promotion_logs (promotion_id, event, details, actor_id)
      VALUES (NEW.id, 'edited', jsonb_build_object('name', NEW.name), auth.uid());
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_promotions_touch
BEFORE INSERT OR UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.tg_promotions_touch();

CREATE TRIGGER trg_promotions_audit
AFTER INSERT OR UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.tg_promotions_audit();
