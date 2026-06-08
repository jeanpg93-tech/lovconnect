
CREATE POLICY "plan tutorials public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'plan-tutorials');

CREATE POLICY "plan tutorials gerente write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'plan-tutorials' AND public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "plan tutorials gerente update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'plan-tutorials' AND public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "plan tutorials gerente delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'plan-tutorials' AND public.has_role(auth.uid(), 'gerente'));
