-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Gerente gerencia revendedores - insert" ON public.resellers;
DROP POLICY IF EXISTS "Gerente gerencia revendedores - update" ON public.resellers;
DROP POLICY IF EXISTS "Gerente gerencia revendedores - delete" ON public.resellers;
DROP POLICY IF EXISTS "Revendedor atualiza seu próprio registro" ON public.resellers;
DROP POLICY IF EXISTS "Revendedor vê seu próprio registro completo" ON public.resellers;
DROP POLICY IF EXISTS "Revendedores ativos visíveis publicamente" ON public.resellers;

-- 1. Gerentes podem TUDO
CREATE POLICY "Gerente gerencia tudo em resellers"
ON public.resellers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'))
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- 2. Revendedores podem ver seu próprio registro
CREATE POLICY "Revendedor vê seu próprio registro"
ON public.resellers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3. Revendedores podem atualizar apenas certos campos do próprio registro (se ativos)
-- Mas para simplificar e evitar o erro de deativação, permitimos que eles se vejam
-- No entanto, a deativação deve ser feita pelo gerente.
-- Se um revendedor tentar se desativar, a política check deve permitir SE ele for gerente OU se ele for o dono e estiver mantendo is_active=true.
CREATE POLICY "Revendedor atualiza próprio registro"
ON public.resellers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND is_active = true);

-- 4. Público pode ver revendedores ativos
CREATE POLICY "Publico vê revendedores ativos"
ON public.resellers
FOR SELECT
TO anon, authenticated
USING (is_active = true);