-- Tabela de customização da extensão
CREATE TABLE public.extension_customizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE,
  is_template BOOLEAN NOT NULL DEFAULT false,

  -- Marca / textos
  brand_kicker TEXT NOT NULL DEFAULT 'Master',
  brand_name TEXT NOT NULL DEFAULT 'Lovable',
  brand_badge TEXT NOT NULL DEFAULT 'PRO',
  display_version TEXT NOT NULL DEFAULT 'v4.3',
  window_title TEXT NOT NULL DEFAULT 'Master Lovable - Painel Lateral',
  manifest_name TEXT NOT NULL DEFAULT 'Master Lovable',
  manifest_description TEXT NOT NULL DEFAULT 'Extensão premium com validação de licença, modo plano e automação inteligente.',
  support_url TEXT NOT NULL DEFAULT 'https://wa.me/5511939110427',

  -- Cores (HEX)
  color_primary TEXT NOT NULL DEFAULT '#3b82f6',
  color_primary_hover TEXT NOT NULL DEFAULT '#2563eb',
  color_secondary TEXT NOT NULL DEFAULT '#a78bfa',
  color_bg TEXT NOT NULL DEFAULT '#0a0a0b',
  color_bg_elevated TEXT NOT NULL DEFAULT '#111113',
  color_bg_surface TEXT NOT NULL DEFAULT '#18181b',

  -- Imagens (URL pública do bucket)
  logo_rect_url TEXT,
  logo_square_url TEXT,
  icon_16_url TEXT,
  icon_32_url TEXT,
  icon_48_url TEXT,
  icon_128_url TEXT,

  -- Atalhos rápidos: array de {label, prompt, icon}
  shortcuts JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customization_scope CHECK (
    (is_template = true AND reseller_id IS NULL) OR
    (is_template = false AND reseller_id IS NOT NULL)
  )
);

-- Apenas um template por extensão
CREATE UNIQUE INDEX uq_ext_template ON public.extension_customizations (extension_id) WHERE is_template = true;
-- Apenas uma customização por (revendedor, extensão)
CREATE UNIQUE INDEX uq_ext_reseller ON public.extension_customizations (extension_id, reseller_id) WHERE reseller_id IS NOT NULL;

ALTER TABLE public.extension_customizations ENABLE ROW LEVEL SECURITY;

-- Leitura: todos autenticados podem ler template; revendedor lê a sua; gerente vê tudo
CREATE POLICY "Autenticados leem template"
  ON public.extension_customizations FOR SELECT
  TO authenticated
  USING (is_template = true);

CREATE POLICY "Revendedor lê sua customização"
  ON public.extension_customizations FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente lê todas"
  ON public.extension_customizations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

-- INSERT
CREATE POLICY "Gerente cria template"
  ON public.extension_customizations FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor cria sua customização"
  ON public.extension_customizations FOR INSERT
  TO authenticated
  WITH CHECK (
    is_template = false
    AND reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
  );

-- UPDATE
CREATE POLICY "Gerente atualiza tudo"
  ON public.extension_customizations FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor atualiza sua customização"
  ON public.extension_customizations FOR UPDATE
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

-- DELETE
CREATE POLICY "Gerente remove customizações"
  ON public.extension_customizations FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor remove sua customização"
  ON public.extension_customizations FOR DELETE
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

-- Trigger updated_at
CREATE TRIGGER trg_ext_cust_updated
  BEFORE UPDATE ON public.extension_customizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bucket público para assets de customização
INSERT INTO storage.buckets (id, name, public)
  VALUES ('extension-customizations', 'extension-customizations', true)
  ON CONFLICT (id) DO NOTHING;

-- Policies do storage
CREATE POLICY "Público lê assets de customização"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'extension-customizations');

CREATE POLICY "Autenticados enviam assets de customização"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'extension-customizations');

CREATE POLICY "Autenticados atualizam seus assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'extension-customizations');

CREATE POLICY "Autenticados removem seus assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'extension-customizations');