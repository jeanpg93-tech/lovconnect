CREATE TABLE public.recharge_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  target_mode TEXT NOT NULL CHECK (target_mode IN ('automatico','manual','maintenance')),
  maintenance_message TEXT,
  note TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  executed_result TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_recharge_schedule_pending ON public.recharge_schedule (scheduled_at) WHERE executed_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_schedule TO authenticated;
GRANT ALL ON public.recharge_schedule TO service_role;

ALTER TABLE public.recharge_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê agenda de recargas"
  ON public.recharge_schedule FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente cria agenda de recargas"
  ON public.recharge_schedule FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza agenda de recargas"
  ON public.recharge_schedule FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove agenda de recargas"
  ON public.recharge_schedule FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER trg_recharge_schedule_updated_at
  BEFORE UPDATE ON public.recharge_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();