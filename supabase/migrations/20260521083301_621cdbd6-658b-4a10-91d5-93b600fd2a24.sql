
CREATE TABLE IF NOT EXISTS public.reseller_license_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('flow','lovax')),
  pack_id text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, method, pack_id)
);

ALTER TABLE public.reseller_license_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus preços"
  ON public.reseller_license_prices FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor cria seus preços"
  ON public.reseller_license_prices FOR INSERT TO authenticated
  WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza seus preços"
  ON public.reseller_license_prices FOR UPDATE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor remove seus preços"
  ON public.reseller_license_prices FOR DELETE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos preços do revendedor"
  ON public.reseller_license_prices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_reseller_license_prices_updated_at
  BEFORE UPDATE ON public.reseller_license_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
