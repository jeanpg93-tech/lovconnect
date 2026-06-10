
-- 1) is_test em reseller_credit_purchases e storefront_orders
ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_rcp_is_test ON public.reseller_credit_purchases(is_test) WHERE is_test = true;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_so_is_test ON public.storefront_orders(is_test) WHERE is_test = true;

-- 2) RPC gerente para marcar/desmarcar venda como teste
CREATE OR REPLACE FUNCTION public.set_sale_test_flag(_table text, _id uuid, _is_test boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _table NOT IN ('orders','reseller_credit_purchases','storefront_orders') THEN
    RAISE EXCEPTION 'invalid_table';
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET is_test = $1, updated_at = now() WHERE id = $2',
    _table
  ) USING _is_test, _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sale_test_flag(text, uuid, boolean) TO authenticated;

-- 3) Idempotência da taxa MisticPay: índice único parcial por tx_id
CREATE UNIQUE INDEX IF NOT EXISTS uniq_misticpay_fee_tx
  ON public.manual_financial_entries ((reference_meta->>'tx_id'))
  WHERE reference_kind = 'misticpay_fee';
