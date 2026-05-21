ALTER TABLE public.profiles ADD COLUMN is_banned BOOLEAN DEFAULT false;

-- Atualizar RLS para permitir que gerentes vejam e atualizem
CREATE POLICY "Gerentes podem atualizar is_banned"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'))
WITH CHECK (public.has_role(auth.uid(), 'gerente'));