
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_whatsapp_events' AND column_name='audience') THEN
    ALTER TABLE public.system_whatsapp_events ADD COLUMN audience text NOT NULL DEFAULT 'new_reseller';
  END IF;
END $$;

UPDATE public.system_whatsapp_events SET audience = 'new_reseller' WHERE event_key IN ('signup_received','signup_approved','adesao_available','panel_unlocked');
UPDATE public.system_whatsapp_events SET audience = 'active_reseller' WHERE event_key IN ('low_balance','low_licenses');

INSERT INTO public.system_whatsapp_events (event_key, label, description, enabled, template, cooldown_hours, variables, audience)
VALUES
  ('referral_new_signup', 'Indicado se cadastrou', 'Enviada ao dono do código quando alguém se cadastra usando o código dele.', true,
   'Olá *{nome}*! 🎉' || E'\n' || 'Você tem um novo indicado: *{indicado}* acaba de se cadastrar usando seu código *{codigo}*.' || E'\n\n' || 'Aguardando aprovação. Te avisamos quando ele for aprovado!',
   0, ARRAY['nome','indicado','codigo'], 'referral_owner'),
  ('referral_approved', 'Indicado aprovado', 'Enviada ao dono do código quando seu indicado é aprovado pelo gerente.', true,
   '✅ *{nome}*, ótima notícia!' || E'\n' || 'Seu indicado *{indicado}* foi aprovado. Agora é torcer pra ele ativar o painel e começar a vender 🚀',
   0, ARRAY['nome','indicado'], 'referral_owner'),
  ('referral_paid_activation', 'Indicado pagou adesão', 'Enviada ao dono do código quando seu indicado paga a adesão e ativa o painel.', true,
   '💰 *{nome}*, parabéns!' || E'\n' || 'Seu indicado *{indicado}* acabou de pagar a adesão e ativou o painel.' || E'\n' || 'Comissões de recargas dele já contam pra você 🎁',
   0, ARRAY['nome','indicado'], 'referral_owner')
ON CONFLICT (event_key) DO NOTHING;
