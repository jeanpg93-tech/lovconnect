-- ===== reseller_balances =====
CREATE TABLE public.reseller_balances (
  reseller_id UUID PRIMARY KEY REFERENCES public.resellers(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT balance_non_negative CHECK (balance_cents >= 0)
);
ALTER TABLE public.reseller_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seu saldo" ON public.reseller_balances FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "Gerente vê todos saldos" ON public.reseller_balances FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente atualiza saldos" ON public.reseller_balances FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente insere saldos" ON public.reseller_balances FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- ===== reseller_extension_prices =====
CREATE TABLE public.reseller_extension_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  license_type TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, extension_id, license_type)
);
ALTER TABLE public.reseller_extension_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus preços" ON public.reseller_extension_prices FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "Gerente gerencia preços - select" ON public.reseller_extension_prices FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia preços - insert" ON public.reseller_extension_prices FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia preços - update" ON public.reseller_extension_prices FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia preços - delete" ON public.reseller_extension_prices FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_rep_updated_at BEFORE UPDATE ON public.reseller_extension_prices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== balance_transactions =====
CREATE TABLE public.balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê suas transações" ON public.balance_transactions FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "Gerente vê todas transações" ON public.balance_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

-- ===== orders =====
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  client_id UUID,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE RESTRICT,
  license_type TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  license_key TEXT,
  provider_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus pedidos" ON public.orders FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "Gerente vê todos pedidos" ON public.orders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Cliente vê seus pedidos" ON public.orders FOR SELECT TO authenticated
USING (client_id = auth.uid());

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Funções atômicas de saldo =====
CREATE OR REPLACE FUNCTION public.debit_reseller_balance(
  _reseller_id UUID, _amount_cents BIGINT, _kind TEXT, _description TEXT, _reference_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _current BIGINT;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, 0) ON CONFLICT (reseller_id) DO NOTHING;
  SELECT balance_cents INTO _current FROM public.reseller_balances
    WHERE reseller_id = _reseller_id FOR UPDATE;
  IF _current < _amount_cents THEN RETURN false; END IF;
  UPDATE public.reseller_balances SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE reseller_id = _reseller_id;
  INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id)
    VALUES (_reseller_id, -_amount_cents, _kind, _description, _reference_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_reseller_balance(
  _reseller_id UUID, _amount_cents BIGINT, _kind TEXT, _description TEXT, _reference_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, _amount_cents)
    ON CONFLICT (reseller_id) DO UPDATE SET
      balance_cents = public.reseller_balances.balance_cents + EXCLUDED.balance_cents,
      updated_at = now();
  INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id)
    VALUES (_reseller_id, _amount_cents, _kind, _description, _reference_id);
END;
$$;