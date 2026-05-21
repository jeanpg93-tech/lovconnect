
-- 1) Tabela de vendas em espera
CREATE TABLE IF NOT EXISTS public.pending_storefront_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  reseller_id uuid NOT NULL,
  cost_cents bigint NOT NULL,
  product_type text NOT NULL DEFAULT 'license',
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_storefront_charges_reseller
  ON public.pending_storefront_charges (reseller_id, created_at)
  WHERE released_at IS NULL;

ALTER TABLE public.pending_storefront_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gerente gerencia pending charges" ON public.pending_storefront_charges;
CREATE POLICY "Gerente gerencia pending charges"
  ON public.pending_storefront_charges
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

DROP POLICY IF EXISTS "Revendedor vê suas pending charges" ON public.pending_storefront_charges;
CREATE POLICY "Revendedor vê suas pending charges"
  ON public.pending_storefront_charges
  FOR SELECT
  TO authenticated
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
  );

-- 2) Custo de pacote de crédito para um revendedor
CREATE OR REPLACE FUNCTION public.get_credit_pack_cost(_reseller_id uuid, _plan_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _credits int;
  _cost bigint;
  _tier_id uuid;
BEGIN
  SELECT credits_amount INTO _credits FROM public.credit_pricing_plans WHERE id = _plan_id;
  IF _credits IS NULL THEN RETURN 0; END IF;

  -- 1) Override do Partner
  SELECT price_cents INTO _cost
  FROM public.reseller_credit_prices
  WHERE reseller_id = _reseller_id
    AND credits_amount = _credits
    AND COALESCE(is_active, true) = true
  LIMIT 1;
  IF _cost IS NOT NULL THEN RETURN _cost; END IF;

  -- 2) Preço fixo do tier
  SELECT (public.get_reseller_tier(_reseller_id)).id INTO _tier_id;
  IF _tier_id IS NOT NULL THEN
    SELECT price_cents INTO _cost
    FROM public.tier_credit_prices
    WHERE tier_id = _tier_id AND plan_id = _plan_id AND is_active = true
    LIMIT 1;
    IF _cost IS NOT NULL THEN RETURN _cost; END IF;
  END IF;

  -- 3) Preço base do pacote
  SELECT price_cents INTO _cost FROM public.credit_pricing_plans WHERE id = _plan_id;
  RETURN COALESCE(_cost, 0);
END;
$$;

-- 3) Releases pendentes: retorna lista de order_ids que foram liberados (saldo já foi debitado)
CREATE OR REPLACE FUNCTION public.try_release_pending_orders(_reseller_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _ok boolean;
  _released uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR _row IN
    SELECT id, order_id, cost_cents
    FROM public.pending_storefront_charges
    WHERE reseller_id = _reseller_id
      AND released_at IS NULL
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT public.debit_reseller_balance(
        _reseller_id, _row.cost_cents, 'order_debit',
        'Liberação venda aguardando saldo', _row.order_id
      ) INTO _ok;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pending_storefront_charges
      SET attempts = attempts + 1, attempted_at = now(), last_error = SQLERRM
      WHERE id = _row.id;
      EXIT; -- erro fatal, para o loop
    END;

    IF NOT _ok THEN
      -- saldo insuficiente, para — fila é processada em ordem cronológica
      UPDATE public.pending_storefront_charges
      SET attempts = attempts + 1, attempted_at = now(), last_error = 'insufficient_balance'
      WHERE id = _row.id;
      EXIT;
    END IF;

    -- Sucesso: marca pago, contabiliza no total gasto e devolve a venda para fila de entrega
    PERFORM public.add_reseller_spent(_reseller_id, _row.cost_cents);

    UPDATE public.storefront_orders
    SET status = 'paid', updated_at = now()
    WHERE id = _row.order_id;

    UPDATE public.pending_storefront_charges
    SET released_at = now(), attempts = attempts + 1, attempted_at = now(), last_error = NULL
    WHERE id = _row.id;

    _released := _released || _row.order_id;
  END LOOP;

  RETURN _released;
END;
$$;
