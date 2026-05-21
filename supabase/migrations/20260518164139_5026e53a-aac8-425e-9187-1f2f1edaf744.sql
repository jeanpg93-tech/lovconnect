-- 1. Adiciona campos em reseller_api_keys para webhooks + rate limit
ALTER TABLE public.reseller_api_keys
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS webhook_events text[] NOT NULL DEFAULT ARRAY[
    'order.completed','order.failed','order.refunded',
    'manual.confirmed','manual.delivered'
  ];

-- 2. Tabela de idempotência (TTL 24h)
CREATE TABLE IF NOT EXISTS public.reseller_api_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL,
  reseller_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  endpoint text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (api_key_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_reseller_api_idempotency_expires
  ON public.reseller_api_idempotency (expires_at);

ALTER TABLE public.reseller_api_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê idempotency"
  ON public.reseller_api_idempotency FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Revendedor vê suas idempotency"
  ON public.reseller_api_idempotency FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

-- 3. Função para enfileirar entregas de webhook
CREATE OR REPLACE FUNCTION public.enqueue_reseller_webhook(
  _reseller_id uuid,
  _api_key_id uuid,
  _event text,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key RECORD;
BEGIN
  -- Se api_key_id veio, usa ele; senão pega todas as keys ativas do reseller com webhook configurado e que escutam esse evento
  IF _api_key_id IS NOT NULL THEN
    SELECT id, webhook_url, webhook_events INTO _key
    FROM public.reseller_api_keys
    WHERE id = _api_key_id AND is_active = true AND revoked_at IS NULL
      AND webhook_url IS NOT NULL AND webhook_url <> ''
      AND _event = ANY(webhook_events);
    IF FOUND THEN
      INSERT INTO public.reseller_api_webhook_deliveries
        (reseller_id, api_key_id, event, payload, target_url)
      VALUES (_reseller_id, _key.id, _event, _payload, _key.webhook_url);
    END IF;
  ELSE
    FOR _key IN
      SELECT id, webhook_url FROM public.reseller_api_keys
      WHERE reseller_id = _reseller_id
        AND is_active = true AND revoked_at IS NULL
        AND webhook_url IS NOT NULL AND webhook_url <> ''
        AND _event = ANY(webhook_events)
    LOOP
      INSERT INTO public.reseller_api_webhook_deliveries
        (reseller_id, api_key_id, event, payload, target_url)
      VALUES (_reseller_id, _key.id, _event, _payload, _key.webhook_url);
    END LOOP;
  END IF;
END;
$$;

-- 4. Trigger em reseller_credit_purchases: dispara nos status terminais
CREATE OR REPLACE FUNCTION public.trg_reseller_purchase_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  _event := CASE
    WHEN NEW.status = 'sucesso' THEN 'order.completed'
    WHEN NEW.status IN ('falha','erro') THEN 'order.failed'
    WHEN NEW.status IN ('estornado','reembolsado','cancelado') THEN 'order.refunded'
    WHEN NEW.status = 'manual_confirmado' THEN 'manual.confirmed'
    WHEN NEW.status = 'manual_entregue' THEN 'manual.delivered'
    ELSE NULL
  END;

  IF _event IS NULL THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'event', _event,
    'pedidoId', NEW.id,
    'status', NEW.status,
    'creditos', NEW.credits,
    'precoCentavos', NEW.price_cents,
    'tipoEntrega', NEW.tipo_entrega,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  PERFORM public.enqueue_reseller_webhook(NEW.reseller_id, NEW.api_key_id, _event, _payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reseller_purchase_webhook ON public.reseller_credit_purchases;
CREATE TRIGGER trg_reseller_purchase_webhook
  AFTER INSERT OR UPDATE OF status ON public.reseller_credit_purchases
  FOR EACH ROW EXECUTE FUNCTION public.trg_reseller_purchase_webhook();