
CREATE TABLE public.manual_recharge_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  provider_pedido_id text NOT NULL UNIQUE,
  workspace_name text,
  invite_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_recharge_metadata_reseller ON public.manual_recharge_metadata(reseller_id, created_at DESC);

ALTER TABLE public.manual_recharge_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus metadados manuais"
  ON public.manual_recharge_metadata FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor cria seus metadados manuais"
  ON public.manual_recharge_metadata FOR INSERT TO authenticated
  WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza seus metadados manuais"
  ON public.manual_recharge_metadata FOR UPDATE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos metadados manuais"
  ON public.manual_recharge_metadata FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente atualiza todos metadados manuais"
  ON public.manual_recharge_metadata FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_manual_recharge_metadata_updated
  BEFORE UPDATE ON public.manual_recharge_metadata
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
