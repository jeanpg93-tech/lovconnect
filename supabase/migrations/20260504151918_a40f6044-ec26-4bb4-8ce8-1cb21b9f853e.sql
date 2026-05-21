CREATE TABLE IF NOT EXISTS public.reseller_extension_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL,
  extension_id uuid NOT NULL,
  license_type text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, extension_id, license_type)
);

ALTER TABLE public.reseller_extension_price_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê overrides revendedor"
  ON public.reseller_extension_price_overrides FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente cria overrides revendedor"
  ON public.reseller_extension_price_overrides FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza overrides revendedor"
  ON public.reseller_extension_price_overrides FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove overrides revendedor"
  ON public.reseller_extension_price_overrides FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor vê seus overrides"
  ON public.reseller_extension_price_overrides FOR SELECT
  TO authenticated USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
  );

CREATE TRIGGER set_updated_at_reseller_overrides
  BEFORE UPDATE ON public.reseller_extension_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_reseller_overrides_lookup
  ON public.reseller_extension_price_overrides (reseller_id, extension_id, license_type)
  WHERE is_active = true;