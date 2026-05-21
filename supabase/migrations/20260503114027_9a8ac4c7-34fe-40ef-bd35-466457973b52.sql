
-- Add file_path column to extensions for download
ALTER TABLE public.extensions
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Create private bucket for extension files
INSERT INTO storage.buckets (id, name, public)
VALUES ('extension-files', 'extension-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
-- Gerente: full access to bucket
CREATE POLICY "Gerente gerencia arquivos de extensão - select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'extension-files' AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia arquivos de extensão - insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'extension-files' AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia arquivos de extensão - update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'extension-files' AND public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente gerencia arquivos de extensão - delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'extension-files' AND public.has_role(auth.uid(), 'gerente'::app_role));

-- Revendedor: pode baixar arquivos de extensões vinculadas a ele
CREATE POLICY "Revendedor baixa arquivos de suas extensões"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'extension-files'
  AND EXISTS (
    SELECT 1
    FROM public.extensions e
    JOIN public.reseller_extensions re ON re.extension_id = e.id
    JOIN public.resellers r ON r.id = re.reseller_id
    WHERE e.file_path = storage.objects.name
      AND r.user_id = auth.uid()
  )
);
