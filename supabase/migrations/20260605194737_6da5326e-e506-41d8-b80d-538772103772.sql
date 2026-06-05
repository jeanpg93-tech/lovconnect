INSERT INTO public.system_whatsapp_events (event_key, label, description, template, enabled, cooldown_hours, audience)
VALUES 
(
  'reseller_sale_manual', 
  'Venda Manual (Painel)', 
  'Notifica o revendedor quando ele gera uma licença manualmente pelo painel.', 
  '✅ *Venda Realizada com Sucesso!* (Manual)\n\n*   *Pedido:* #{pedido_id}\n*   *Cliente:* {cliente_nome} ({cliente_whatsapp})\n*   *Canal:* Painel Revendedor\n\n🔑 *Licença:* `{licenca}`\n\n💰 *Custo:* R$ {custo}\n💰 *Saldo Atual:* R$ {saldo}\n\n{aviso_saldo}',
  true,
  0,
  'reseller'
),
(
  'reseller_sale_api', 
  'Venda via API', 
  'Notifica o revendedor quando uma licença é gerada via integração de API.', 
  '🚀 *Venda Realizada com Sucesso!* (API)\n\n*   *Pedido:* #{pedido_id}\n*   *Cliente:* {cliente_nome} ({cliente_whatsapp})\n*   *Canal:* API de Integração\n\n🔑 *Licença:* `{licenca}`\n\n💰 *Custo:* R$ {custo}\n💰 *Saldo Atual:* R$ {saldo}\n\n{aviso_saldo}',
  true,
  0,
  'reseller'
),
(
  'reseller_sale_store', 
  'Venda na Loja Pública', 
  'Notifica o revendedor quando ocorre uma venda em sua loja automática.', 
  '🏪 *Nova Venda na Sua Loja!*\n\n*   *Pedido:* #{pedido_id}\n*   *Cliente:* {cliente_nome} ({cliente_whatsapp})\n*   *Canal:* Loja Pública\n\n🔑 *Licença:* `{licenca}`\n\n💰 *Custo Operacional:* R$ {custo}\n💰 *Saldo Atual:* R$ {saldo}\n\n{aviso_saldo}',
  true,
  0,
  'reseller'
),
(
  'reseller_sale_pack', 
  'Venda via Pack (Licença)', 
  'Notifica o revendedor quando uma licença é consumida de um Pack.', 
  '📦 *Licença do Pack Vendida!*\n\n*   *Pedido:* #{pedido_id}\n*   *Cliente:* {cliente_nome} ({cliente_whatsapp})\n*   *Canal:* {canal}\n\n🔑 *Licença:* `{licenca}`\n\n📉 *Restantes no Pack:* {licencas_restantes}\n💰 *Saldo no Painel:* R$ {saldo}\n\n{aviso_saldo}',
  true,
  0,
  'reseller'
)
ON CONFLICT (event_key) DO UPDATE SET 
  template = EXCLUDED.template,
  label = EXCLUDED.label,
  audience = EXCLUDED.audience,
  description = EXCLUDED.description;