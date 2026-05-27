
-- =========================================
-- TABELA: promotions
-- =========================================
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  extension_discount_pct numeric(5,2),
  credit_discount_pct numeric(5,2),
  recharge_bonus_pct numeric(5,2),
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_status_check CHECK (status IN ('scheduled','active','paused','ended')),
  CONSTRAINT promotions_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT promotions_pct_extension_check CHECK (extension_discount_pct IS NULL OR (extension_discount_pct >= 0 AND extension_discount_pct <= 100)),
  CONSTRAINT promotions_pct_credit_check CHECK (credit_discount_pct IS NULL OR (credit_discount_pct >= 0 AND credit_discount_pct <= 100)),
  CONSTRAINT promotions_pct_bonus_check CHECK (recharge_bonus_pct IS NULL OR (recharge_bonus_pct >= 0 AND recharge_bonus_pct <= 500)),
  CONSTRAINT promotions_has_value CHECK (
    extension_discount_pct IS NOT NULL
    OR credit_discount_pct IS NOT NULL
    OR recharge_bonus_pct IS NOT NULL
  )
);

CREATE UNIQUE INDEX promotions_one_active_idx
  ON public.promotions ((1)) WHERE status = 'active';

CREATE INDEX promotions_status_starts_idx ON public.promotions (status, starts_at);
CREATE INDEX promotions_status_ends_idx ON public.promotions (status, ends_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia promoções - select"
  ON public.promotions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia promoções - insert"
  ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia promoções - update"
  ON public.promotions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia promoções - delete"
  ON public.promotions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

-- Autenticados podem ver a promoção atualmente ativa (para banners)
CREATE POLICY "Autenticados veem promoção ativa atual"
  ON public.promotions FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

-- =========================================
-- TABELA: promotion_logs
-- =========================================
CREATE TABLE public.promotion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE CASCADE,
  event text NOT NULL,
  details jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_logs_event_check CHECK (event IN ('created','edited','scheduled','activated','deactivated','ended','deleted'))
);

CREATE INDEX promotion_logs_promotion_idx ON public.promotion_logs (promotion_id, created_at DESC);
CREATE INDEX promotion_logs_created_idx ON public.promotion_logs (created_at DESC);

GRANT SELECT, INSERT ON public.promotion_logs TO authenticated;
GRANT ALL ON public.promotion_logs TO service_role;

ALTER TABLE public.promotion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê logs de promoções"
  ON public.promotion_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente insere logs de promoções"
  ON public.promotion_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::app_role));

-- =========================================
-- FUNCTION: get_active_promotion()
-- =========================================
CREATE OR REPLACE FUNCTION public.get_active_promotion()
RETURNS public.promotions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.promotions
  WHERE status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  ORDER BY activated_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_promotion() TO anon, authenticated, service_role;

-- =========================================
-- TRIGGER: atualiza updated_at e registra logs
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_promotions_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := now();
    v_event := CASE WHEN NEW.status = 'active' THEN 'activated' ELSE 'created' END;
    INSERT INTO public.promotion_logs (promotion_id, event, details, actor_id)
    VALUES (NEW.id, v_event, jsonb_build_object('name', NEW.name, 'status', NEW.status), NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
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
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promotions_audit
  BEFORE INSERT OR UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.tg_promotions_audit();
