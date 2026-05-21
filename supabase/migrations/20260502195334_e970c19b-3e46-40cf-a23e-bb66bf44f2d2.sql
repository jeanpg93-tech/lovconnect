-- API keys do revendedor
CREATE TABLE public.reseller_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_reseller_api_keys_reseller ON public.reseller_api_keys(reseller_id);
CREATE INDEX idx_reseller_api_keys_hash ON public.reseller_api_keys(key_hash);

ALTER TABLE public.reseller_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê suas keys" ON public.reseller_api_keys
  FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor cria suas keys" ON public.reseller_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza suas keys" ON public.reseller_api_keys
  FOR UPDATE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor remove suas keys" ON public.reseller_api_keys
  FOR DELETE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todas keys" ON public.reseller_api_keys
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER trg_reseller_api_keys_updated
  BEFORE UPDATE ON public.reseller_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Logs de uso
CREATE TABLE public.reseller_api_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.reseller_api_keys(id) ON DELETE CASCADE,
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT NOT NULL,
  cost_cents BIGINT NOT NULL DEFAULT 0,
  license_type TEXT,
  license_key TEXT,
  error_message TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reseller_api_usage_reseller ON public.reseller_api_usage(reseller_id, created_at DESC);
CREATE INDEX idx_reseller_api_usage_key ON public.reseller_api_usage(api_key_id, created_at DESC);

ALTER TABLE public.reseller_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seu uso" ON public.reseller_api_usage
  FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todo uso" ON public.reseller_api_usage
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

-- Histórico de webhooks
CREATE TABLE public.reseller_api_webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.reseller_api_keys(id) ON DELETE CASCADE,
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  target_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  attempt INT NOT NULL DEFAULT 1,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_reseller ON public.reseller_api_webhook_deliveries(reseller_id, created_at DESC);

ALTER TABLE public.reseller_api_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus webhooks" ON public.reseller_api_webhook_deliveries
  FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos webhooks" ON public.reseller_api_webhook_deliveries
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));