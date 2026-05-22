CREATE TABLE public.reseller_license_cost_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL,
  pack_id text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, pack_id)
);

CREATE INDEX idx_rlco_lookup
  ON public.reseller_license_cost_overrides (reseller_id, pack_id)
  WHERE is_active = true;

ALTER TABLE public.reseller_license_cost_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê license cost overrides"
  ON public.reseller_license_cost_overrides FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente cria license cost overrides"
  ON public.reseller_license_cost_overrides FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza license cost overrides"
  ON public.reseller_license_cost_overrides FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove license cost overrides"
  ON public.reseller_license_cost_overrides FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor vê seus license cost overrides"
  ON public.reseller_license_cost_overrides FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_rlco_updated_at
  BEFORE UPDATE ON public.reseller_license_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();