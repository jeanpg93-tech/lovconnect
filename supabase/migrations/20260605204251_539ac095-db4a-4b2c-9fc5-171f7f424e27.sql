-- Atualiza o template de venda manual
UPDATE system_whatsapp_events 
SET template = '🚀 *Venda Realizada com Sucesso!* (Manual)

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* Painel Revendedor
⏳ *Prazo:* {prazo}

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_manual';

-- Atualiza o template de venda via API
UPDATE system_whatsapp_events 
SET template = '🚀 *Venda Realizada com Sucesso!* (API)

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* API de Integração
⏳ *Prazo:* {prazo}

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_api';

-- Atualiza o template de venda via Loja
UPDATE system_whatsapp_events 
SET template = '🏪 *Nova Venda na Sua Loja!*

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* Loja Pública
⏳ *Prazo:* {prazo}

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_store';

-- Atualiza o template de venda via Pack
UPDATE system_whatsapp_events 
SET template = '📦 *Licença do Pack Vendida!*

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* {canal}
⏳ *Prazo:* {prazo}

🔑 *Licença:* `{licenca}`

📉 *Restantes no Pack:* {licencas_restantes}
💰 *Saldo do Painel:* R$ {saldo}'
WHERE event_key = 'reseller_sale_pack';