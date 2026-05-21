
-- Permitir que gerentes leiam e gravem em extension-builds (necessário para upload do template base)
CREATE POLICY "Gerente manages extension-builds"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'extension-builds' AND public.has_role(auth.uid(), 'gerente'::public.app_role))
WITH CHECK (bucket_id = 'extension-builds' AND public.has_role(auth.uid(), 'gerente'::public.app_role));
