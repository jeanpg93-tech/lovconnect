-- Adicionar colunas de suporte se não existirem (algumas já parecem existir no types.ts mas vamos garantir)
ALTER TABLE public.reseller_storefronts 
ADD COLUMN IF NOT EXISTS support_whatsapp TEXT,
ADD COLUMN IF NOT EXISTS support_telegram_url TEXT,
ADD COLUMN IF NOT EXISTS support_discord_url TEXT;

-- Criar tabela de depoimentos
CREATE TABLE IF NOT EXISTS public.storefront_testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    content TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.storefront_testimonials ENABLE ROW LEVEL SECURITY;

-- Políticas para Testemunhos
CREATE POLICY "Qualquer pessoa pode ver depoimentos ativos" 
ON public.storefront_testimonials 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Revendedores podem gerenciar seus próprios depoimentos" 
ON public.storefront_testimonials 
FOR ALL 
USING (
    reseller_id IN (
        SELECT id FROM public.resellers WHERE user_id = auth.uid()
    )
);

-- Trigger para updated_at
CREATE TRIGGER update_storefront_testimonials_updated_at
BEFORE UPDATE ON public.storefront_testimonials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();