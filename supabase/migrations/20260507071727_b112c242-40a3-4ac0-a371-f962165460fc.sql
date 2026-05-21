-- 1. Garantir que a coluna is_banned existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_banned') THEN
        ALTER TABLE public.profiles ADD COLUMN is_banned BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Garantir que a função has_role é SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 3. Atualizar políticas da tabela profiles
DROP POLICY IF EXISTS "Gerentes podem atualizar is_banned" ON public.profiles;
DROP POLICY IF EXISTS "Gerente atualiza perfis" ON public.profiles;

-- Política abrangente para gerentes na tabela profiles
CREATE POLICY "Gerente gerencia perfis"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'))
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Garantir que os usuários ainda possam ver/editar o próprio perfil (sem mexer no is_banned via CHECK)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND (is_banned IS NULL OR is_banned = (SELECT is_banned FROM public.profiles WHERE id = auth.uid())));
