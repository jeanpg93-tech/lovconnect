ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS evolution_template_api text;

COMMENT ON COLUMN public.reseller_integrations.evolution_template_api IS
  'Template opcional para mensagens disparadas em vendas via API pública (loja própria). Se NULL, usa evolution_message_template.';