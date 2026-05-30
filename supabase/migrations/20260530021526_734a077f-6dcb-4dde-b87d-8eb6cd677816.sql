
-- Novo modelo "Revendedor Pack": créditos avulsos de chave
-- ============================================================

-- 1) Permitir billing_mode = 'pack'
ALTER TABLE public.resellers DROP CONSTRAINT IF EXISTS resellers_billing_mode_check;
ALTER TABLE public.resellers
  ADD CONSTRAINT resellers_billing_mode_check
  CHECK (billing_mode IN ('normal','subscription','pack'));

CREATE INDEX IF NOT EXISTS idx_resellers_billing_mode_pack
  ON public.resellers(billing_mode) WHERE billing_mode = 'pack';

-- 2) Catálogo de pacotes
CREATE TABLE public.license_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.license_packs TO anon, authenticated;
GRANT ALL ON public.license_packs TO service_role;

ALTER TABLE public.license_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pacotes ativos visíveis a todos"
  ON public.license_packs FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente gerencia pacotes"
  ON public.license_packs FOR ALL
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_license_packs_updated
  BEFORE UPDATE ON public.license_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Saldo de créditos por revendedor
CREATE TABLE public.reseller_pack_balances (
  reseller_id UUID PRIMARY KEY REFERENCES public.resellers(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,
  lifetime_consumed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reseller_pack_balances TO authenticated;
GRANT ALL ON public.reseller_pack_balances TO service_role;

ALTER TABLE public.reseller_pack_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seu saldo"
  ON public.reseller_pack_balances FOR SELECT
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

CREATE TRIGGER trg_reseller_pack_balances_updated
  BEFORE UPDATE ON public.reseller_pack_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Compras de pacote (Pix MisticPay)
CREATE TABLE public.reseller_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.license_packs(id),
  pack_name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','failed','cancelled','manual')),
  provider TEXT,
  provider_tx_id TEXT,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by_admin UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pack_purchases_reseller ON public.reseller_pack_purchases(reseller_id, created_at DESC);
CREATE INDEX idx_pack_purchases_status ON public.reseller_pack_purchases(status, created_at DESC);
CREATE INDEX idx_pack_purchases_tx ON public.reseller_pack_purchases(provider_tx_id);

GRANT SELECT ON public.reseller_pack_purchases TO authenticated;
GRANT ALL ON public.reseller_pack_purchases TO service_role;

ALTER TABLE public.reseller_pack_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê suas compras"
  ON public.reseller_pack_purchases FOR SELECT
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

CREATE TRIGGER trg_reseller_pack_purchases_updated
  BEFORE UPDATE ON public.reseller_pack_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Ledger de créditos (extrato granular)
CREATE TABLE public.reseller_pack_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('purchase','consume','admin_credit','admin_debit','refund')),
  delta_credits INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  purchase_id UUID REFERENCES public.reseller_pack_purchases(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  actor_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pack_ledger_reseller ON public.reseller_pack_ledger(reseller_id, created_at DESC);

GRANT SELECT ON public.reseller_pack_ledger TO authenticated;
GRANT ALL ON public.reseller_pack_ledger TO service_role;

ALTER TABLE public.reseller_pack_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seu extrato"
  ON public.reseller_pack_ledger FOR SELECT
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

-- 6) RPC para creditar saldo (compra paga ou crédito manual)
CREATE OR REPLACE FUNCTION public.pack_credit_balance(
  _reseller_id UUID,
  _credits INTEGER,
  _kind TEXT,
  _purchase_id UUID,
  _description TEXT,
  _actor_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance INTEGER;
BEGIN
  IF _credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;
  IF _kind NOT IN ('purchase','admin_credit','refund') THEN
    RAISE EXCEPTION 'invalid kind for credit';
  END IF;

  INSERT INTO public.reseller_pack_balances (reseller_id, credits, lifetime_purchased)
  VALUES (_reseller_id, _credits, _credits)
  ON CONFLICT (reseller_id) DO UPDATE
    SET credits = public.reseller_pack_balances.credits + EXCLUDED.credits,
        lifetime_purchased = public.reseller_pack_balances.lifetime_purchased + EXCLUDED.lifetime_purchased,
        updated_at = now()
  RETURNING credits INTO _new_balance;

  INSERT INTO public.reseller_pack_ledger
    (reseller_id, kind, delta_credits, balance_after, purchase_id, description, actor_id)
  VALUES (_reseller_id, _kind, _credits, _new_balance, _purchase_id, _description, _actor_id);

  RETURN _new_balance;
END $$;

-- 7) RPC para débito atômico ao gerar chave
CREATE OR REPLACE FUNCTION public.pack_consume_credit(
  _reseller_id UUID,
  _order_id UUID,
  _description TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current INTEGER;
  _new_balance INTEGER;
BEGIN
  INSERT INTO public.reseller_pack_balances (reseller_id, credits)
  VALUES (_reseller_id, 0)
  ON CONFLICT (reseller_id) DO NOTHING;

  SELECT credits INTO _current
    FROM public.reseller_pack_balances
    WHERE reseller_id = _reseller_id FOR UPDATE;

  IF _current < 1 THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.reseller_pack_balances
    SET credits = credits - 1,
        lifetime_consumed = lifetime_consumed + 1,
        updated_at = now()
    WHERE reseller_id = _reseller_id
    RETURNING credits INTO _new_balance;

  INSERT INTO public.reseller_pack_ledger
    (reseller_id, kind, delta_credits, balance_after, order_id, description)
  VALUES (_reseller_id, 'consume', -1, _new_balance, _order_id, _description);

  RETURN _new_balance;
END $$;

-- 8) RPC para débito manual (gerente ajusta saldo pra menos)
CREATE OR REPLACE FUNCTION public.pack_debit_balance(
  _reseller_id UUID,
  _credits INTEGER,
  _description TEXT,
  _actor_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current INTEGER;
  _new_balance INTEGER;
BEGIN
  IF _credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;

  INSERT INTO public.reseller_pack_balances (reseller_id, credits)
  VALUES (_reseller_id, 0)
  ON CONFLICT (reseller_id) DO NOTHING;

  SELECT credits INTO _current
    FROM public.reseller_pack_balances
    WHERE reseller_id = _reseller_id FOR UPDATE;

  IF _current < _credits THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.reseller_pack_balances
    SET credits = credits - _credits,
        updated_at = now()
    WHERE reseller_id = _reseller_id
    RETURNING credits INTO _new_balance;

  INSERT INTO public.reseller_pack_ledger
    (reseller_id, kind, delta_credits, balance_after, description, actor_id)
  VALUES (_reseller_id, 'admin_debit', -_credits, _new_balance, _description, _actor_id);

  RETURN _new_balance;
END $$;

-- 9) Seeds: 4 pacotes iniciais
INSERT INTO public.license_packs (name, credits, price_cents, sort_order, description) VALUES
  ('Starter', 10, 25000, 10, '10 chaves — ideal pra começar'),
  ('Plus', 25, 57500, 20, '25 chaves — 8% de desconto'),
  ('Pro', 50, 107500, 30, '50 chaves — 14% de desconto'),
  ('Mega', 100, 195000, 40, '100 chaves — 22% de desconto');

-- 10) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_pack_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_pack_purchases;
