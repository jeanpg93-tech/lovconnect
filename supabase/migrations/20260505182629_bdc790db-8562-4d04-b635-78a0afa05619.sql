CREATE TABLE public.direct_sales (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    amount_cents BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed
    provider_transaction_id TEXT UNIQUE,
    plan_name TEXT,
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.direct_sales ENABLE ROW LEVEL SECURITY;

-- Políticas: Qualquer um pode inserir (checkout público)
CREATE POLICY "Anyone can create direct sales" ON public.direct_sales FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all direct sales" ON public.direct_sales FOR SELECT USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Admins can update direct sales" ON public.direct_sales FOR UPDATE USING (public.has_role(auth.uid(), 'gerente'));

-- Trigger para updated_at
CREATE TRIGGER update_direct_sales_updated_at
BEFORE UPDATE ON public.direct_sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
