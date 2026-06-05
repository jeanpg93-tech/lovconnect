
-- 1) settings (singleton enforced by unique boolean)
CREATE TABLE public.system_whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  instance_name text NOT NULL DEFAULT 'system',
  status text NOT NULL DEFAULT 'disconnected',
  connected_number text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  footer_text text NOT NULL DEFAULT '_Esta é uma mensagem automática enviada pelo sistema._',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_whatsapp_settings TO authenticated;
GRANT ALL ON public.system_whatsapp_settings TO service_role;
ALTER TABLE public.system_whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerente manages settings" ON public.system_whatsapp_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- 2) events
CREATE TABLE public.system_whatsapp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  template text NOT NULL,
  cooldown_hours integer NOT NULL DEFAULT 24,
  variables text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_whatsapp_events TO authenticated;
GRANT ALL ON public.system_whatsapp_events TO service_role;
ALTER TABLE public.system_whatsapp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerente manages events" ON public.system_whatsapp_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- 3) log
CREATE TABLE public.system_whatsapp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('auto','manual','test')),
  event_key text REFERENCES public.system_whatsapp_events(event_key) ON DELETE SET NULL,
  reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  to_number text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','error')),
  error_reason text,
  evolution_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX system_whatsapp_log_created_at_idx ON public.system_whatsapp_log (created_at DESC);
CREATE INDEX system_whatsapp_log_event_key_idx ON public.system_whatsapp_log (event_key);
CREATE INDEX system_whatsapp_log_reseller_idx ON public.system_whatsapp_log (reseller_id);
CREATE INDEX system_whatsapp_log_evo_msg_idx ON public.system_whatsapp_log (evolution_message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_whatsapp_log TO authenticated;
GRANT ALL ON public.system_whatsapp_log TO service_role;
ALTER TABLE public.system_whatsapp_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerente manages log" ON public.system_whatsapp_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- updated_at triggers
CREATE TRIGGER trg_system_whatsapp_settings_updated
  BEFORE UPDATE ON public.system_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_system_whatsapp_events_updated
  BEFORE UPDATE ON public.system_whatsapp_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed singleton settings
INSERT INTO public.system_whatsapp_settings (singleton) VALUES (true);

-- seed 6 events with default templates
INSERT INTO public.system_whatsapp_events (event_key, label, description, template, variables) VALUES
('signup_received',
 'Cadastro recebido',
 'Enviado logo após o cadastro do revendedor, enquanto aguarda aprovação.',
 E'Olá *{nome}*! 👋\n\nRecebemos seu cadastro como revendedor e ele está em análise pela nossa equipe.\n\nVocê será notificado assim que for aprovado. ✅',
 ARRAY['nome']),
('signup_approved',
 'Cadastro aprovado',
 'Enviado quando o gerente aprova o cadastro do revendedor.',
 E'Boas notícias, *{nome}*! 🎉\n\nSeu cadastro foi *aprovado*! Você já pode acessar seu painel:\n{link}',
 ARRAY['nome','link']),
('adesao_available',
 'Adesão liberada para pagamento',
 'Enviado quando o pagamento da adesão do painel é liberado.',
 E'Olá *{nome}*!\n\nA cobrança da *adesão do painel* está disponível para pagamento.\n\nValor: *R$ {valor}*\nLink: {link}\n\nApós a confirmação, seu painel será liberado.',
 ARRAY['nome','valor','link']),
('panel_unlocked',
 'Painel liberado',
 'Enviado após confirmação do pagamento da adesão.',
 E'Tudo certo, *{nome}*! 🚀\n\nSeu painel foi *liberado* e já está pronto para uso.\n\nAcesse: {link}',
 ARRAY['nome','link']),
('low_balance',
 'Saldo baixo no painel',
 'Mesmo aviso já exibido no painel quando o saldo do revendedor está baixo.',
 E'Atenção *{nome}*! ⚠️\n\nSeu *saldo* no painel está baixo: *R$ {valor}*.\n\nFaça uma recarga para não interromper suas vendas:\n{link}',
 ARRAY['nome','valor','link']),
('low_licenses',
 'Poucas licenças (Pack)',
 'Aviso para revendedores Pack quando restam poucas licenças.',
 E'Atenção *{nome}*! ⚠️\n\nRestam apenas *{restantes}* licenças do seu pack *{pack}*.\n\nCompre mais licenças para continuar vendendo:\n{link}',
 ARRAY['nome','restantes','pack','link']);
