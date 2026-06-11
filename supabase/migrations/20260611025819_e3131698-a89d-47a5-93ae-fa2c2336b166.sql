CREATE OR REPLACE FUNCTION public.notify_plan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setts record;
  reseller_name text;
  msg text;
  emoji text;
  title text;
  toggle_on boolean;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  SELECT * INTO setts FROM public.telegram_settings WHERE id = 1;
  IF setts IS NULL OR setts.chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO reseller_name FROM public.resellers WHERE id = NEW.reseller_id;

  IF NEW.status = 'awaiting_confirm' THEN
    emoji := '⏳'; title := 'Aguardando confirmação do Owner';
    toggle_on := COALESCE(setts.notify_plan_workspace_submitted, true);
  ELSIF NEW.status = 'active' THEN
    emoji := '✅'; title := 'Plano aprovado e ativado';
    toggle_on := COALESCE(setts.notify_plan_owner_verified, true);
  ELSIF NEW.status = 'owner_rejected' THEN
    emoji := '⚠️'; title := 'Você rejeitou o Owner (cliente foi avisado)';
    toggle_on := COALESCE(setts.notify_plan_owner_rejected, true);
  ELSIF NEW.status = 'completed' THEN
    emoji := '🏁'; title := 'Plano finalizado com sucesso';
    toggle_on := COALESCE(setts.notify_plan_completed, true);
  ELSIF NEW.status = 'cancelled' THEN
    emoji := '🛑'; title := 'Plano cancelado';
    toggle_on := COALESCE(setts.notify_plan_cancelled, true);
  END IF;

  IF NOT COALESCE(toggle_on, false) OR title IS NULL THEN RETURN NEW; END IF;

  msg := emoji || ' <b>' || title || '</b>' || E'\n'
      || '👤 ' || COALESCE(NEW.customer_name, '—') || E'\n'
      || '🗂 Workspace: <code>' || COALESCE(NEW.workspace_name, '—') || '</code>' || E'\n'
      || '📧 Email: <code>' || COALESCE(NEW.owner_email_required, '—') || '</code>' || E'\n'
      || '🛒 Revendedor: ' || COALESCE(reseller_name, '—') || E'\n'
      || '⚡ ' || NEW.credits_per_day || ' créd/dia × ' || NEW.duration_days || ' dias';

  IF NEW.status = 'owner_rejected' AND NEW.owner_rejected_reason IS NOT NULL THEN
    msg := msg || E'\n' || '💬 Motivo: ' || NEW.owner_rejected_reason;
  END IF;

  IF NEW.status = 'cancelled' AND NEW.cancelled_reason IS NOT NULL THEN
    msg := msg || E'\n' || '💬 Motivo: ' || NEW.cancelled_reason;
  END IF;

  INSERT INTO public.telegram_outbox (text, parse_mode, reference_kind, reference_id)
  VALUES (msg, 'HTML', 'plan_sub_' || NEW.status, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_plan_delivery_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setts record;
  sub record;
  reseller_name text;
  msg text;
  emoji text;
  title text;
  toggle_on boolean;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('delivered','failed') THEN RETURN NEW; END IF;

  SELECT * INTO setts FROM public.telegram_settings WHERE id = 1;
  IF setts IS NULL OR setts.chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO sub FROM public.reseller_recharge_plan_subscriptions WHERE id = NEW.subscription_id;
  IF sub IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO reseller_name FROM public.resellers WHERE id = sub.reseller_id;

  IF NEW.status = 'delivered' THEN
    emoji := '💧'; title := 'Entrega diária realizada';
    toggle_on := COALESCE(setts.notify_plan_delivery_success, true);
  ELSE
    emoji := '❌'; title := 'Falha em entrega diária';
    toggle_on := COALESCE(setts.notify_plan_delivery_failed, true);
  END IF;

  IF NOT COALESCE(toggle_on, false) THEN RETURN NEW; END IF;

  msg := emoji || ' <b>' || title || '</b>' || E'\n'
      || '👤 ' || COALESCE(sub.customer_name, '—') || E'\n'
      || '🗂 Workspace: <code>' || COALESCE(sub.workspace_name, '—') || '</code>' || E'\n'
      || '📅 Dia ' || NEW.day_number || ' de ' || sub.duration_days || E'\n'
      || '⚡ ' || NEW.credits || ' créditos' || E'\n'
      || '🛒 Revendedor: ' || COALESCE(reseller_name, '—');

  IF NEW.notes IS NOT NULL AND NEW.notes <> '' THEN
    msg := msg || E'\n' || '📝 ' || NEW.notes;
  END IF;

  INSERT INTO public.telegram_outbox (text, parse_mode, reference_kind, reference_id)
  VALUES (msg, 'HTML', 'plan_delivery_' || NEW.status, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;