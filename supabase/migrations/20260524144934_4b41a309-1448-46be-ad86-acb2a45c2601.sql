
-- 1) Recreate missing trigger handle_new_user on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill missing profiles for already-created auth users
INSERT INTO public.profiles (id, email, display_name, approval_status, affiliate_code_used)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)),
       'pending',
       upper(NULLIF(trim(u.raw_user_meta_data->>'affiliate_code'),''))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3) Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "gerentes can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.has_role(auth.uid(),'gerente'::public.app_role));

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 4) Trigger: new pending profile -> notify all gerentes
CREATE OR REPLACE FUNCTION public.notify_managers_new_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    SELECT ur.user_id,
           'new_signup',
           'Novo cadastro aguardando aprovação',
           COALESCE(NEW.display_name, NEW.email, 'Novo revendedor'),
           '/painel/gerente/aprovacoes',
           jsonb_build_object('profile_id', NEW.id, 'email', NEW.email, 'affiliate_code', NEW.affiliate_code_used)
    FROM public.user_roles ur
    WHERE ur.role = 'gerente';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_managers_new_signup ON public.profiles;
CREATE TRIGGER trg_notify_managers_new_signup
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_managers_new_signup();

-- 5) Trigger: recharge paid -> notify reseller
CREATE OR REPLACE FUNCTION public.notify_reseller_recharge_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  IF NEW.paid_at IS NOT NULL AND (OLD.paid_at IS NULL) THEN
    SELECT user_id INTO _user_id FROM public.resellers WHERE id = NEW.reseller_id;
    IF _user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (_user_id, 'recharge_paid',
              'Recarga confirmada',
              'Recarga de R$ ' || to_char(NEW.amount_cents::numeric/100.0,'FM999G990D00') || ' creditada no seu saldo.',
              '/painel/revendedor/recarga',
              jsonb_build_object('intent_id', NEW.id, 'amount_cents', NEW.amount_cents));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_recharge_paid ON public.recharge_intents;
CREATE TRIGGER trg_notify_recharge_paid
AFTER UPDATE ON public.recharge_intents
FOR EACH ROW EXECUTE FUNCTION public.notify_reseller_recharge_paid();

-- 6) Backfill notification for existing pending profiles (so currently-pending appear too)
INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
SELECT ur.user_id, 'new_signup',
       'Novo cadastro aguardando aprovação',
       COALESCE(p.display_name, p.email, 'Novo revendedor'),
       '/painel/gerente/aprovacoes',
       jsonb_build_object('profile_id', p.id, 'email', p.email, 'affiliate_code', p.affiliate_code_used)
FROM public.profiles p
CROSS JOIN public.user_roles ur
WHERE p.approval_status = 'pending'
  AND ur.role = 'gerente'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = ur.user_id
      AND n.type = 'new_signup'
      AND (n.metadata->>'profile_id')::uuid = p.id
  );

-- 7) Helper RPCs
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
