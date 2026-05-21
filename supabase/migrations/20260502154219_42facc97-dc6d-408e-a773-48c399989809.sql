-- Tabela para armazenar configurações do provedor de extensões
CREATE TABLE IF NOT EXISTS public.provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL,
  base_url text NOT NULL DEFAULT 'https://mybkregqvkottrzsogmi.supabase.co/functions/v1/extension-api',
  webhook_url text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_settings ENABLE ROW LEVEL SECURITY;

-- Apenas gerentes podem ler/escrever (as chamadas reais usam service role na edge function)
CREATE POLICY "Gerentes podem ver settings"
  ON public.provider_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes podem inserir settings"
  ON public.provider_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes podem atualizar settings"
  ON public.provider_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerentes podem deletar settings"
  ON public.provider_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_provider_settings_updated_at
  BEFORE UPDATE ON public.provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();