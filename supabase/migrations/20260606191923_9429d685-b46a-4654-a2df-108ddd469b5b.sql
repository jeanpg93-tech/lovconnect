INSERT INTO public.system_whatsapp_events (event_key, label, description, enabled, template, cooldown_hours, variables, audience)
VALUES (
  'reseller_sale_subscription',
  'Venda mensalista realizada',
  'Aviso enviado ao revendedor mensalista quando uma licença paga é gerada.',
  true,
  '🟣 *Venda Realizada com Sucesso!* (Mensalista)

🆔 *Pedido:* #{pedido_id}
👤 *Cliente:* {cliente_nome} ({cliente_whatsapp})
🔌 *Canal:* Mensalista
⏳ *Prazo:* {prazo}

🔑 *Licença:* `{licenca}`

💰 *Saldo do Painel:* R$ {saldo}',
  0,
  ARRAY['pedido_id', 'cliente_nome', 'cliente_whatsapp', 'prazo', 'licenca', 'saldo'],
  'active_reseller'
)
ON CONFLICT (event_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  enabled = true,
  template = EXCLUDED.template,
  cooldown_hours = 0,
  variables = EXCLUDED.variables,
  audience = EXCLUDED.audience,
  updated_at = now();