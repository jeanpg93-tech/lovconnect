-- Allow resellers to update their own slug & display_name (but not other fields like is_active)
CREATE POLICY "Revendedor atualiza seu próprio registro"
ON public.resellers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND is_active = true);