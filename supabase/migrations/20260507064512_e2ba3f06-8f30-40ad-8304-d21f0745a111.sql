-- Remover a política antiga que estava causando conflito quando o gerente tentava desativar um revendedor
DROP POLICY "Revendedor atualiza seu próprio registro" ON public.resellers;

-- Criar uma nova política para o revendedor que não conflite com a política do gerente
-- A política "Gerente gerencia revendedores - update" já cobre o gerente (has_role(auth.uid(), 'gerente'))
-- Esta política foca apenas no que o revendedor logado pode fazer
CREATE POLICY "Revendedor atualiza seu próprio registro" 
ON public.resellers 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  (auth.uid() = user_id AND is_active = true) OR 
  (has_role(auth.uid(), 'gerente'))
);