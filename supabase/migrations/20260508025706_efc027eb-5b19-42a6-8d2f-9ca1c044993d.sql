
CREATE TABLE public.provider_credit_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id TEXT NOT NULL,
  creditos INTEGER NOT NULL,
  preco_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'aguardando',
  email_convite_bot TEXT,
  workspace_id TEXT,
  workspace_name TEXT,
  creditos_enviados INTEGER,
  etapa_processamento INTEGER,
  provider_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_credit_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own provider credit orders"
  ON public.provider_credit_orders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own provider credit orders"
  ON public.provider_credit_orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own provider credit orders"
  ON public.provider_credit_orders
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_provider_credit_orders_updated_at
  BEFORE UPDATE ON public.provider_credit_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
