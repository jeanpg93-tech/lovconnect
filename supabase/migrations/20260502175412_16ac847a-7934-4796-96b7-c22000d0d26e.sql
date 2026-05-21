CREATE TABLE public.reseller_integrations (
  reseller_id UUID NOT NULL PRIMARY KEY,
  misticpay_enabled BOOLEAN NOT NULL DEFAULT false,
  misticpay_client_id TEXT,
  misticpay_client_secret TEXT,
  evolution_enabled BOOLEAN NOT NULL DEFAULT false,
  evolution_base_url TEXT,
  evolution_api_key TEXT,
  evolution_instance TEXT,
  evolution_message_template TEXT NOT NULL DEFAULT 'Olá {nome}! ✅ Sua licença {tipo} foi gerada.

🔑 Chave: {chave}

Guarde com cuidado.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê suas integrações"
ON public.reseller_integrations FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor insere suas integrações"
ON public.reseller_integrations FOR INSERT TO authenticated
WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza suas integrações"
ON public.reseller_integrations FOR UPDATE TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todas integrações"
ON public.reseller_integrations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente atualiza todas integrações"
ON public.reseller_integrations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente insere integrações"
ON public.reseller_integrations FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER reseller_integrations_set_updated_at
BEFORE UPDATE ON public.reseller_integrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();