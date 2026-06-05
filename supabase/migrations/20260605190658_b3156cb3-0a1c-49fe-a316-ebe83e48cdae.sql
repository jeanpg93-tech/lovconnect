INSERT INTO system_whatsapp_events (event_key, label, audience, variables, enabled, template, description)
VALUES 
  (
    'recharge_confirmed', 
    'Recarga confirmada', 
    'active_reseller', 
    ARRAY['nome', 'valor', 'saldo'], 
    true, 
    'Olá *{nome}*! 👋\n\nSua recarga de *R$ {valor}* foi confirmada com sucesso. 🎉\n\nSeu saldo atual é: *R$ {saldo}*.\n\nBoas vendas! 🚀', 
    'Enviado quando o revendedor completa uma recarga de saldo'
  ),
  (
    'pack_purchase_confirmed', 
    'Compra de pacote confirmada', 
    'active_reseller', 
    ARRAY['nome', 'pack_name', 'credits'], 
    true, 
    'Olá *{nome}*! 👋\n\nSua compra do pacote *{pack_name}* foi confirmada com sucesso. 🎉\n\nForam adicionadas *{credits}* licenças à sua conta.\n\nBoas vendas! 🚀', 
    'Enviado quando o revendedor completa a compra de um pacote de licenças'
  )
ON CONFLICT (event_key) DO UPDATE SET 
  label = EXCLUDED.label,
  audience = EXCLUDED.audience,
  variables = EXCLUDED.variables,
  template = EXCLUDED.template,
  description = EXCLUDED.description;
