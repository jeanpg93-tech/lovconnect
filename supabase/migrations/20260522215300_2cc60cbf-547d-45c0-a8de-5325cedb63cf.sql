
-- 1. Settings (singleton)
CREATE TABLE public.telegram_settings (
  id INT PRIMARY KEY DEFAULT 1,
  chat_id BIGINT,
  pairing_code TEXT,
  pairing_expires_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  notify_sales BOOLEAN NOT NULL DEFAULT true,
  notify_recharges BOOLEAN NOT NULL DEFAULT true,
  notify_signups BOOLEAN NOT NULL DEFAULT true,
  notify_refunds BOOLEAN NOT NULL DEFAULT true,
  notify_reseller_activity BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telegram_settings_singleton CHECK (id = 1)
);

INSERT INTO public.telegram_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente reads telegram settings"
  ON public.telegram_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "gerente updates telegram settings"
  ON public.telegram_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER telegram_settings_updated_at
  BEFORE UPDATE ON public.telegram_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Outbox
CREATE TABLE public.telegram_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  parse_mode TEXT DEFAULT 'HTML',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX idx_telegram_outbox_pending ON public.telegram_outbox (created_at) WHERE sent_at IS NULL;

ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gerente reads outbox"
  ON public.telegram_outbox FOR SELECT
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

-- 3. Helper to enqueue
CREATE OR REPLACE FUNCTION public.telegram_enqueue(_text TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _enabled BOOLEAN;
BEGIN
  SELECT chat_id IS NOT NULL INTO _enabled FROM public.telegram_settings WHERE id = 1;
  IF NOT _enabled THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (text) VALUES (_text);
END;
$$;

-- 4. Trigger: new signup
CREATE OR REPLACE FUNCTION public.trg_telegram_new_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _on BOOLEAN;
BEGIN
  SELECT notify_signups INTO _on FROM public.telegram_settings WHERE id = 1;
  IF NOT COALESCE(_on, false) THEN RETURN NEW; END IF;
  IF NEW.approval_status = 'pending' THEN
    PERFORM public.telegram_enqueue(
      '🆕 <b>Novo cadastro pendente</b>' || E'\n' ||
      'Nome: ' || COALESCE(NEW.display_name, '—') || E'\n' ||
      'Email: ' || COALESCE(NEW.email, '—') || E'\n' ||
      'Código afiliado: ' || COALESCE(NEW.affiliate_code_used, '—')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER telegram_new_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_new_signup();

-- 5. Trigger: balance transactions (sales, recharges, refunds, reseller activity)
CREATE OR REPLACE FUNCTION public.trg_telegram_balance_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings RECORD;
  _reseller_name TEXT;
  _amount_brl TEXT;
  _emoji TEXT;
  _label TEXT;
  _should_send BOOLEAN := false;
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
  _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

  IF NEW.kind = 'deposit' THEN
    _should_send := _settings.notify_recharges;
    _emoji := '💰'; _label := 'Recarga de saldo';
  ELSIF NEW.kind = 'order_debit' THEN
    _should_send := _settings.notify_sales;
    _emoji := '🛒'; _label := 'Venda na loja';
  ELSIF NEW.kind IN ('refund','estorno','reembolso') THEN
    _should_send := _settings.notify_refunds;
    _emoji := '↩️'; _label := 'Reembolso';
  ELSE
    _should_send := _settings.notify_reseller_activity;
    _emoji := '⚙️'; _label := 'Movimentação (' || NEW.kind || ')';
  END IF;

  IF _should_send THEN
    PERFORM public.telegram_enqueue(
      _emoji || ' <b>' || _label || '</b>' || E'\n' ||
      'Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
      'Valor: ' || _amount_brl || E'\n' ||
      CASE WHEN NEW.description IS NOT NULL THEN 'Detalhe: ' || NEW.description ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER telegram_balance_tx
  AFTER INSERT ON public.balance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_balance_tx();

-- 6. RPC: generate pairing code (called from UI)
CREATE OR REPLACE FUNCTION public.telegram_generate_pairing_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _code TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _code := lpad(floor(random() * 1000000)::int::text, 6, '0');
  UPDATE public.telegram_settings
    SET pairing_code = _code,
        pairing_expires_at = now() + interval '15 minutes',
        updated_at = now()
    WHERE id = 1;
  RETURN _code;
END;
$$;

-- 7. RPC: unpair
CREATE OR REPLACE FUNCTION public.telegram_unpair()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.telegram_settings
    SET chat_id = NULL, paired_at = NULL, pairing_code = NULL, pairing_expires_at = NULL
    WHERE id = 1;
END;
$$;
