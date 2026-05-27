CREATE TABLE IF NOT EXISTS public.license_base_costs (
  duration_code text PRIMARY KEY,
  cost_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.license_base_costs TO authenticated;
GRANT ALL ON public.license_base_costs TO service_role;

ALTER TABLE public.license_base_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem custos base de licença"
ON public.license_base_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerente insere custos base de licença"
ON public.license_base_costs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza custos base de licença"
ON public.license_base_costs FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove custos base de licença"
ON public.license_base_costs FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role));

INSERT INTO public.license_base_costs (duration_code, cost_cents) VALUES
  ('1d', 0), ('7d', 0), ('30d', 0), ('90d', 0), ('365d', 0), ('lifetime', 0)
ON CONFLICT (duration_code) DO NOTHING;