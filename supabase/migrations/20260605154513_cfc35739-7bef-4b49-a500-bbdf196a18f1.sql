
-- Evento pack_sold_out
INSERT INTO public.system_whatsapp_events
  (event_key, label, description, enabled, template, cooldown_hours, variables, audience)
VALUES (
  'pack_sold_out',
  'Pack esgotado',
  'Avisa o revendedor que as licenças do pack acabaram. O sistema passa a debitar do saldo do painel automaticamente. Mostra saldo atual (com alerta se baixo), link para recarregar e link para comprar novo pack.',
  true,
  E'⚠️ *{nome}*, suas licenças do *Pack* acabaram!\n\nA partir de agora, cada nova venda será debitada automaticamente do *saldo do seu painel*.\n\n{aviso_saldo}\n\nPara voltar a vender com o custo reduzido, compre um novo Pack:\n{link}',
  24,
  ARRAY['nome','valor','aviso_saldo','link','link_recarga']::text[],
  'active_reseller'
)
ON CONFLICT (event_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  variables = EXCLUDED.variables,
  audience = EXCLUDED.audience;

-- Trigger: dispara quando credits do pack cai para 0
CREATE OR REPLACE FUNCTION public.trg_system_whatsapp_pack_sold_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.credits = 0 AND COALESCE(OLD.credits, 1) > 0 AND NEW.lifetime_purchased > 0 THEN
    PERFORM public.dispatch_system_whatsapp_event(
      'pack_sold_out', NEW.reseller_id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sys_wa_pack_sold_out ON public.reseller_pack_balances;
CREATE TRIGGER trg_sys_wa_pack_sold_out
  AFTER UPDATE OF credits ON public.reseller_pack_balances
  FOR EACH ROW EXECUTE FUNCTION public.trg_system_whatsapp_pack_sold_out();
