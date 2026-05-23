INSERT INTO public.app_settings (key, value) VALUES
('evolution_template_license', to_jsonb(E'Olá *{nome}*! ✅\n\nSua licença *{tipo}* foi gerada com sucesso.\n\n🔑 Chave: `{chave}`\n\nGuarde com cuidado. Qualquer dúvida, é só chamar!\n\n— *{loja}*'::text)),
('evolution_template_recharge', to_jsonb(E'Olá *{nome}*! ✅\n\nSua recarga de *{valor}* foi confirmada.\n\n🔗 Acesse: {link}\n\nObrigado pela preferência!\n\n— *{loja}*'::text)),
('evolution_template_storefront', to_jsonb(E'Olá *{nome}*! ✅\n\nSua compra foi confirmada com sucesso!\n\n📦 Produto: {tipo}\n💰 Valor: {valor}\n🔑 Entrega: {chave}\n\nQualquer dúvida, é só chamar!\n\n— *{loja}*'::text))
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS evolution_template_recharge text,
  ADD COLUMN IF NOT EXISTS evolution_template_storefront text;