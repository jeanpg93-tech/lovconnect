-- 1. Remover políticas problemáticas que causam recursão
DROP POLICY IF EXISTS "Gerente gerencia perfis" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Gerentes podem atualizar is_banned" ON public.profiles;
DROP POLICY IF EXISTS "Gerente atualiza perfis" ON public.profiles;

-- 2. Política para Gerentes (Usa has_role que é SECURITY DEFINER, evitando recursão)
CREATE POLICY "Gerente gerencia perfis"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

-- 3. Política para o próprio usuário ver seu perfil
-- Nota: SELECT é geralmente seguro, mas vamos garantir que não dependa de si mesmo de forma recursiva
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 4. Política para o próprio usuário atualizar seu perfil
-- Removemos o subquery que consultava a própria tabela no WITH CHECK para evitar recursão
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 5. Garantir que Revendedores possam ver seus clientes (usando a tabela resellers como ponte)
DROP POLICY IF EXISTS "Revendedor vê seus clientes" ON public.profiles;
CREATE POLICY "Revendedor vê seus clientes"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  reseller_id IN (
    SELECT id FROM public.resellers WHERE user_id = auth.uid()
  )
);