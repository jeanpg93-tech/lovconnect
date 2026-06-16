ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS evolution_send_on_api boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.reseller_integrations.evolution_send_on_api IS
  'Quando true, dispara mensagem WhatsApp automática para o cliente em vendas feitas via API pública do revendedor (loja própria).';