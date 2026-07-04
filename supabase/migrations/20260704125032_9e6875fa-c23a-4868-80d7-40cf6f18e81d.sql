
ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS evolution_template_claude text;

INSERT INTO public.app_settings (key, value, is_public)
VALUES (
  'evolution_template_claude',
  to_jsonb('Olá, {nome}! 👋

Sua chave Claude do plano *{plano}* já está pronta:

🔑 *API Key (ANTHROPIC_AUTH_TOKEN):*
{api_key}

🌐 *Base URL (ANTHROPIC_BASE_URL):*
{base_url}

Configure essas duas variáveis no Cursor, Cline ou Claude Code e já pode usar.

Qualquer dúvida, é só chamar! — {loja}'::text),
  false
)
ON CONFLICT (key) DO NOTHING;
