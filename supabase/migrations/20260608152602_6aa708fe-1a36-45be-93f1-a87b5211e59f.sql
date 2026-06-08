
-- 1) Novo status
ALTER TYPE public.recharge_plan_status ADD VALUE IF NOT EXISTS 'owner_rejected';

-- 2) Colunas de rejeição na assinatura
ALTER TABLE public.reseller_recharge_plan_subscriptions
  ADD COLUMN IF NOT EXISTS owner_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_rejected_reason text,
  ADD COLUMN IF NOT EXISTS owner_rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_confirmation_attempts integer NOT NULL DEFAULT 0;

-- 3) Toggles novos no telegram_settings
ALTER TABLE public.telegram_settings
  ADD COLUMN IF NOT EXISTS notify_plan_workspace_submitted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_resubmit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_owner_verified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_owner_rejected boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_delivery_success boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_delivery_failed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_plan_cancelled boolean NOT NULL DEFAULT true;

-- 4) Tabela de tutoriais (mídia que aparece pro cliente)
CREATE TABLE IF NOT EXISTS public.recharge_plan_tutorial_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  media_url text,
  media_type text NOT NULL DEFAULT 'gif' CHECK (media_type IN ('gif','image','video')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.recharge_plan_tutorial_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_plan_tutorial_media TO authenticated;
GRANT ALL ON public.recharge_plan_tutorial_media TO service_role;

ALTER TABLE public.recharge_plan_tutorial_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tutoriais visiveis publicamente"
  ON public.recharge_plan_tutorial_media FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "tutoriais editaveis por gerente"
  ON public.recharge_plan_tutorial_media FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_recharge_plan_tutorial_media_updated_at
  BEFORE UPDATE ON public.recharge_plan_tutorial_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insere slots vazios para o gerente preencher depois
INSERT INTO public.recharge_plan_tutorial_media (slug, title, description, sort_order)
VALUES
  ('add-owner-email', 'Como adicionar nosso email como Owner', 'Mostra ao cliente como adicionar o email no workspace dele como Owner', 1),
  ('find-workspace-name', 'Como encontrar o nome do workspace', 'Mostra ao cliente onde copiar o nome correto do workspace', 2)
ON CONFLICT (slug) DO NOTHING;

-- 5) Função de notificação para mudança de status da assinatura
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

  emoji := NULL;
  title := NULL;
  toggle_on := false;

  IF NEW.status = 'awaiting_confirm' AND OLD.status = 'awaiting_owner' THEN
    emoji := '📨'; title := 'Cliente preencheu workspace (aguarda sua verificação)';
    toggle_on := setts.notify_plan_workspace_submitted;
  ELSIF NEW.status = 'awaiting_confirm' AND OLD.status = 'owner_rejected' THEN
    emoji := '🔁'; title := 'Cliente reenviou após rejeição (verificar de novo)';
    toggle_on := setts.notify_plan_resubmit;
  ELSIF NEW.status = 'active' THEN
    emoji := '✅'; title := 'Owner aprovado — entregas iniciadas';
    toggle_on := setts.notify_plan_owner_verified;
  ELSIF NEW.status = 'owner_rejected' THEN
    emoji := '⚠️'; title := 'Você rejeitou o Owner (cliente foi avisado)';
    toggle_on := setts.notify_plan_owner_rejected;
  ELSIF NEW.status = 'completed' THEN
    emoji := '🏁'; title := 'Plano finalizado com sucesso';
    toggle_on := setts.notify_plan_completed;
  ELSIF NEW.status = 'cancelled' THEN
    emoji := '🛑'; title := 'Plano cancelado';
    toggle_on := setts.notify_plan_cancelled;
  END IF;

  IF NOT toggle_on OR title IS NULL THEN RETURN NEW; END IF;

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
  VALUES (msg, 'HTML', 'plan_subscription', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan_status_change ON public.reseller_recharge_plan_subscriptions;
CREATE TRIGGER trg_notify_plan_status_change
  AFTER UPDATE OF status ON public.reseller_recharge_plan_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_plan_status_change();

-- 6) Função de notificação para mudança de status de entrega
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
    toggle_on := setts.notify_plan_delivery_success;
  ELSE
    emoji := '❌'; title := 'Falha em entrega diária';
    toggle_on := setts.notify_plan_delivery_failed;
  END IF;

  IF NOT toggle_on THEN RETURN NEW; END IF;

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
  VALUES (msg, 'HTML', 'plan_delivery', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan_delivery_change ON public.recharge_plan_deliveries;
CREATE TRIGGER trg_notify_plan_delivery_change
  AFTER UPDATE OF status ON public.recharge_plan_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notify_plan_delivery_change();
