
-- Fase 1: modo de venda Pack/Saldo para revendedores

-- 1. Coluna delivery_source no revendedor
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS delivery_source text NOT NULL DEFAULT 'wallet';

ALTER TABLE public.resellers
  DROP CONSTRAINT IF EXISTS resellers_delivery_source_check;
ALTER TABLE public.resellers
  ADD CONSTRAINT resellers_delivery_source_check
  CHECK (delivery_source IN ('wallet','pack'));

-- 2. Flag de fallback nas transações de saldo
ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS fallback_from_pack boolean NOT NULL DEFAULT false;

-- 3. RPC para o revendedor alternar o modo de venda
CREATE OR REPLACE FUNCTION public.set_reseller_delivery_source(_source text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reseller_id uuid;
BEGIN
  IF _source NOT IN ('wallet','pack') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  SELECT id INTO _reseller_id
    FROM public.resellers
    WHERE user_id = auth.uid()
      AND billing_mode = 'pack'
    LIMIT 1;

  IF _reseller_id IS NULL THEN
    RAISE EXCEPTION 'not_pack_reseller';
  END IF;

  UPDATE public.resellers
    SET delivery_source = _source,
        updated_at = now()
    WHERE id = _reseller_id;

  RETURN _source;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_reseller_delivery_source(text) TO authenticated;

-- 4. RPC para tentar consumir 1 crédito do pacote numa venda (Loja/API).
--    Difere de pack_consume_credit (geração manual) por:
--      - não lançar exceção quando falta crédito; retorna -1 para o caller fazer fallback;
--      - registrar ledger com kind = 'sale_consume'.
CREATE OR REPLACE FUNCTION public.pack_try_consume_sale_credit(
  _reseller_id uuid,
  _order_id uuid,
  _description text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current integer;
  _new_balance integer;
BEGIN
  INSERT INTO public.reseller_pack_balances (reseller_id, credits)
  VALUES (_reseller_id, 0)
  ON CONFLICT (reseller_id) DO NOTHING;

  SELECT credits INTO _current
    FROM public.reseller_pack_balances
    WHERE reseller_id = _reseller_id
    FOR UPDATE;

  IF _current IS NULL OR _current < 1 THEN
    RETURN -1;
  END IF;

  UPDATE public.reseller_pack_balances
    SET credits = credits - 1,
        lifetime_consumed = lifetime_consumed + 1,
        updated_at = now()
    WHERE reseller_id = _reseller_id
    RETURNING credits INTO _new_balance;

  INSERT INTO public.reseller_pack_ledger
    (reseller_id, kind, delta_credits, balance_after, order_id, description)
  VALUES (_reseller_id, 'sale_consume', -1, _new_balance, _order_id, _description);

  RETURN _new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.pack_try_consume_sale_credit(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pack_try_consume_sale_credit(uuid, uuid, text) TO service_role;
