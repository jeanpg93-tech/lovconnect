
-- =========================================
-- 1. ENUM de papéis
-- =========================================
CREATE TYPE public.app_role AS ENUM ('gerente', 'revendedor', 'cliente');

-- =========================================
-- 2. Tabela user_roles
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- 3. Função has_role (SECURITY DEFINER, evita recursão de RLS)
-- =========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Função utilitária para pegar o "papel principal" do usuário
CREATE OR REPLACE FUNCTION public.get_primary_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'gerente' THEN 1
    WHEN 'revendedor' THEN 2
    WHEN 'cliente' THEN 3
  END
  LIMIT 1;
$$;

-- =========================================
-- 4. Políticas user_roles
-- =========================================
CREATE POLICY "Usuários veem seus papéis"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Gerente vê todos os papéis"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente atribui papéis"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente remove papéis"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

-- =========================================
-- 5. Tabela resellers
-- =========================================
CREATE TABLE public.resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

-- Lista pública de revendedores ativos (para o cliente escolher no cadastro)
CREATE POLICY "Revendedores ativos visíveis publicamente"
ON public.resellers FOR SELECT TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Gerente gerencia revendedores - insert"
ON public.resellers FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia revendedores - update"
ON public.resellers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia revendedores - delete"
ON public.resellers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Revendedor vê seu próprio registro completo"
ON public.resellers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER resellers_updated_at
BEFORE UPDATE ON public.resellers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 6. profiles: adicionar reseller_id
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL;

-- Gerente vê todos os perfis
CREATE POLICY "Gerente vê todos os perfis"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

-- Revendedor vê os perfis dos seus clientes
CREATE POLICY "Revendedor vê seus clientes"
ON public.profiles FOR SELECT TO authenticated
USING (
  reseller_id IN (
    SELECT id FROM public.resellers WHERE user_id = auth.uid()
  )
);

-- =========================================
-- 7. Atualizar handle_new_user para gravar reseller_id e role cliente
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reseller_id UUID;
BEGIN
  -- Lê o reseller_id passado em raw_user_meta_data (se houver e válido/ativo)
  BEGIN
    _reseller_id := NULLIF(NEW.raw_user_meta_data->>'reseller_id', '')::UUID;
  EXCEPTION WHEN others THEN
    _reseller_id := NULL;
  END;

  IF _reseller_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resellers WHERE id = _reseller_id AND is_active = true
    ) THEN
      _reseller_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, reseller_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    _reseller_id
  );

  -- Todo novo signup é cliente por padrão
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- 8. Tabela extensions (catálogo)
-- =========================================
CREATE TABLE public.extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem extensões ativas"
ON public.extensions FOR SELECT TO authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente cria extensões"
ON public.extensions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente atualiza extensões"
ON public.extensions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente remove extensões"
ON public.extensions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER extensions_updated_at
BEFORE UPDATE ON public.extensions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 9. reseller_extensions (quais extensões cada revendedor pode vender)
-- =========================================
CREATE TABLE public.reseller_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, extension_id)
);

ALTER TABLE public.reseller_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê todos os vínculos revendedor-extensão"
ON public.reseller_extensions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Revendedor vê suas extensões"
ON public.reseller_extensions FOR SELECT TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Gerente gerencia vínculos - insert"
ON public.reseller_extensions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia vínculos - delete"
ON public.reseller_extensions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

-- =========================================
-- 10. client_extensions (extensões de cada cliente)
-- =========================================
CREATE TABLE public.client_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, extension_id)
);

ALTER TABLE public.client_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cliente vê suas extensões"
ON public.client_extensions FOR SELECT TO authenticated
USING (auth.uid() = client_id);

CREATE POLICY "Revendedor vê extensões dos seus clientes"
ON public.client_extensions FOR SELECT TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Gerente vê todas as extensões dos clientes"
ON public.client_extensions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Revendedor concede extensão a seu cliente"
ON public.client_extensions FOR INSERT TO authenticated
WITH CHECK (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = client_id
      AND profiles.reseller_id = client_extensions.reseller_id
  )
  AND EXISTS (
    SELECT 1 FROM public.reseller_extensions re
    WHERE re.reseller_id = client_extensions.reseller_id
      AND re.extension_id = client_extensions.extension_id
  )
);

CREATE POLICY "Revendedor atualiza extensões dos seus clientes"
ON public.client_extensions FOR UPDATE TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Revendedor remove extensões dos seus clientes"
ON public.client_extensions FOR DELETE TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Gerente gerencia tudo - insert client_ext"
ON public.client_extensions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia tudo - update client_ext"
ON public.client_extensions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente gerencia tudo - delete client_ext"
ON public.client_extensions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER client_extensions_updated_at
BEFORE UPDATE ON public.client_extensions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- 11. Índices úteis
-- =========================================
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_profiles_reseller_id ON public.profiles(reseller_id);
CREATE INDEX idx_client_extensions_client_id ON public.client_extensions(client_id);
CREATE INDEX idx_client_extensions_reseller_id ON public.client_extensions(reseller_id);
CREATE INDEX idx_reseller_extensions_reseller_id ON public.reseller_extensions(reseller_id);
