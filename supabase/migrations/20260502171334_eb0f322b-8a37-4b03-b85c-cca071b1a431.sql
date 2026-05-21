CREATE TABLE public.recharge_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'misticpay',
  provider_transaction_id TEXT,
  qr_code_base64 TEXT,
  copy_paste TEXT,
  payer_name TEXT,
  payer_document TEXT,
  bonus_cents BIGINT NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recharge_intents_reseller ON public.recharge_intents(reseller_id, created_at DESC);
CREATE INDEX idx_recharge_intents_provider_tx ON public.recharge_intents(provider_transaction_id);

ALTER TABLE public.recharge_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê suas recargas"
  ON public.recharge_intents FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todas recargas"
  ON public.recharge_intents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_recharge_intents_updated
  BEFORE UPDATE ON public.recharge_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();