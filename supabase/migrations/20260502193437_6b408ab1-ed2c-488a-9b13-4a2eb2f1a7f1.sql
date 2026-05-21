CREATE TABLE public.storefront_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  reporter_contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.storefront_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a report"
ON public.storefront_reports FOR INSERT
TO anon, authenticated
WITH CHECK (length(reason) BETWEEN 2 AND 100 AND (details IS NULL OR length(details) <= 1000));

CREATE POLICY "Gerente vê denúncias"
ON public.storefront_reports FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza denúncias"
ON public.storefront_reports FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove denúncias"
ON public.storefront_reports FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER set_storefront_reports_updated_at
BEFORE UPDATE ON public.storefront_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_storefront_reports_reseller ON public.storefront_reports(reseller_id, created_at DESC);