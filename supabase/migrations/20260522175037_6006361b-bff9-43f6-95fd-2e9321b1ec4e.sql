
-- 1) trial_registrations: PII publicamente legível — restringir leitura apenas ao gerente
DROP POLICY IF EXISTS "Users can view trial registrations" ON public.trial_registrations;

CREATE POLICY "Gerente vê trial registrations"
  ON public.trial_registrations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

-- 2) Bucket extension-customizations: trocar INSERT genérica por políticas
--    com verificação de propriedade (gerente para 'template/', revendedor dono para 'reseller/<customization_id>/')
DROP POLICY IF EXISTS "Autenticados enviam assets de customização" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados atualizam seus assets" ON storage.objects;
DROP POLICY IF EXISTS "Autenticados removem seus assets" ON storage.objects;

CREATE POLICY "Gerente gerencia template extension assets"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'extension-customizations'
    AND (storage.foldername(name))[1] = 'template'
    AND public.has_role(auth.uid(), 'gerente'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'extension-customizations'
    AND (storage.foldername(name))[1] = 'template'
    AND public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

CREATE POLICY "Revendedor gerencia seus extension assets"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'extension-customizations'
    AND (storage.foldername(name))[1] = 'reseller'
    AND EXISTS (
      SELECT 1
      FROM public.extension_customizations ec
      JOIN public.resellers r ON r.id = ec.reseller_id
      WHERE ec.id::text = (storage.foldername(name))[2]
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'extension-customizations'
    AND (storage.foldername(name))[1] = 'reseller'
    AND EXISTS (
      SELECT 1
      FROM public.extension_customizations ec
      JOIN public.resellers r ON r.id = ec.reseller_id
      WHERE ec.id::text = (storage.foldername(name))[2]
        AND r.user_id = auth.uid()
    )
  );
