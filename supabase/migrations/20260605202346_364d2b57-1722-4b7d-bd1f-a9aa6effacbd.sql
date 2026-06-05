-- Update manual sale template
UPDATE public.system_whatsapp_events 
SET template = '🚀 *Venda Realizada com Sucesso!* (Manual)

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* Painel Revendedor

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_manual';

-- Update API sale template
UPDATE public.system_whatsapp_events 
SET template = '🚀 *Venda Realizada com Sucesso!* (API)

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* API de Integração

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_api';

-- Update Store sale template
UPDATE public.system_whatsapp_events 
SET template = '🏪 *Nova Venda na Sua Loja!*

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* Loja Pública

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_store';

-- Update Pack sale template
UPDATE public.system_whatsapp_events 
SET template = '📦 *Licença do Pack Vendida!*

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* {canal}

🔑 *Licença:* `{licenca}`

📉 *Restantes no Pack:* {licencas_restantes}
💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_pack';
