-- Allow any authenticated user to view extension versions of active extensions
DROP POLICY IF EXISTS "Revendedor vê versões das suas extensões" ON public.extension_versions;

CREATE POLICY "Autenticados veem versões de extensões ativas"
ON public.extension_versions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.extensions e
    WHERE e.id = extension_versions.extension_id AND e.is_active = true
  )
);