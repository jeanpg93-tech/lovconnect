-- 1. Planos globais de créditos
CREATE TABLE public.credit_pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credits_amount INTEGER NOT NULL UNIQUE,
    label TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Preços personalizados do revendedor para créditos
CREATE TABLE public.reseller_credit_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
    credits_amount INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(reseller_id, credits_amount)
);

-- 3. Atualizar reseller_integrations para incluir a chave da API de créditos
ALTER TABLE public.reseller_integrations 
ADD COLUMN IF NOT EXISTS lovable_credits_api_key TEXT,
ADD COLUMN IF NOT EXISTS lovable_credits_enabled BOOLEAN DEFAULT false;

-- 4. Atualizar reseller_storefronts para controle de exibição de créditos
ALTER TABLE public.reseller_storefronts
ADD COLUMN IF NOT EXISTS show_credits BOOLEAN DEFAULT false;

-- 5. Atualizar tabelas de pedidos para suportar créditos
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'extension',
ADD COLUMN IF NOT EXISTS credit_amount INTEGER;

ALTER TABLE public.storefront_orders
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'extension',
ADD COLUMN IF NOT EXISTS credit_amount INTEGER,
ADD COLUMN IF NOT EXISTS delivery_type TEXT,
ADD COLUMN IF NOT EXISTS invite_link TEXT;

-- 6. Habilitar RLS e criar políticas
ALTER TABLE public.credit_pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_credit_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Credit plans are viewable by everyone" 
ON public.credit_pricing_plans FOR SELECT USING (true);

CREATE POLICY "Resellers can manage their own credit prices" 
ON public.reseller_credit_prices FOR ALL 
USING (auth.uid() IN (SELECT user_id FROM public.resellers WHERE id = reseller_id));

CREATE POLICY "Storefront credit prices are viewable by everyone" 
ON public.reseller_credit_prices FOR SELECT USING (true);

-- 7. Inserir planos padrão (baseado na documentação)
INSERT INTO public.credit_pricing_plans (credits_amount, label) VALUES
(10, '10 Créditos'),
(50, '50 Créditos'),
(100, '100 Créditos'),
(500, '500 Créditos'),
(1000, '1000 Créditos')
ON CONFLICT (credits_amount) DO NOTHING;

-- 8. Trigger para updated_at
CREATE TRIGGER update_credit_pricing_plans_updated_at BEFORE UPDATE ON public.credit_pricing_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reseller_credit_prices_updated_at BEFORE UPDATE ON public.reseller_credit_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();