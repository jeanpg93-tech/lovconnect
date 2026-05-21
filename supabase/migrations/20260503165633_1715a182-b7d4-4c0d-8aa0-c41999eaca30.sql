-- Permitir que qualquer autenticado baixe arquivos de extensões ativas
DROP POLICY IF EXISTS "Revendedor baixa arquivos de suas extensões" ON storage.objects;

CREATE POLICY "Autenticados baixam arquivos de extensões ativas"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'extension-files'
  AND EXISTS (
    SELECT 1 FROM public.extensions e
    WHERE e.file_path = objects.name AND e.is_active = true
  )
);

-- Permitir leitura pública da landing page da extensão (já existe policy "Autenticados veem...")
-- Adicionar acesso público anônimo para landing pages
CREATE POLICY "Público vê extensões ativas para landing"
ON public.extensions FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY "Público vê versões de extensões ativas"
ON public.extension_versions FOR SELECT
TO anon
USING (EXISTS (SELECT 1 FROM public.extensions e WHERE e.id = extension_versions.extension_id AND e.is_active = true));