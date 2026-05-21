-- 1) Novas colunas para fluxo gerenciado de QR
ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS instance_name TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;

-- 2) Tabela de configurações globais (chave/valor)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Gerentes can insert settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes can update settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes can delete settings"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Template padrão inicial
INSERT INTO public.app_settings (key, value)
VALUES (
  'evolution_message_template',
  to_jsonb('Olá {nome}! ✅ Sua licença {tipo} foi gerada.

🔑 Chave: {chave}

Guarde com cuidado.'::text)
)
ON CONFLICT (key) DO NOTHING;