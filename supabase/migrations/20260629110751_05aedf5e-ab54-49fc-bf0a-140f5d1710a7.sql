
ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS tokens_exhausted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.claude_provider_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text UNIQUE,
  event text NOT NULL,
  provider_key_id text,
  order_id uuid REFERENCES public.claude_orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  signature_ok boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.claude_provider_webhook_events TO service_role;
ALTER TABLE public.claude_provider_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claude_webhook_events_service_only"
  ON public.claude_provider_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_claude_webhook_events_key ON public.claude_provider_webhook_events(provider_key_id);
CREATE INDEX IF NOT EXISTS idx_claude_orders_provider_key_id ON public.claude_orders(provider_key_id);
