
CREATE TABLE public.extension_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  changelog TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_extension_versions_ext ON public.extension_versions(extension_id, created_at DESC);

ALTER TABLE public.extension_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia versões - select"
  ON public.extension_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia versões - insert"
  ON public.extension_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia versões - update"
  ON public.extension_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia versões - delete"
  ON public.extension_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Revendedor vê versões das suas extensões"
  ON public.extension_versions FOR SELECT TO authenticated
  USING (
    extension_id IN (
      SELECT re.extension_id FROM public.reseller_extensions re
      JOIN public.resellers r ON r.id = re.reseller_id
      WHERE r.user_id = auth.uid()
    )
  );

CREATE POLICY "Cliente vê versões das suas extensões"
  ON public.extension_versions FOR SELECT TO authenticated
  USING (
    extension_id IN (
      SELECT extension_id FROM public.client_extensions
      WHERE client_id = auth.uid()
    )
  );
