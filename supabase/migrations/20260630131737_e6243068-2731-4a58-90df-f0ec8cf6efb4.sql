
CREATE OR REPLACE FUNCTION public.try_release_pending_orders(_reseller_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _ok boolean;
  _pack_res integer;
  _used text;
  _released uuid[] := ARRAY[]::uuid[];
  _order RECORD;
BEGIN
  FOR _row IN
    SELECT id, order_id, cost_cents
    FROM public.pending_storefront_charges
    WHERE reseller_id = _reseller_id
      AND released_at IS NULL
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    _used := NULL;

    SELECT id, delivery_source, license_type, product_type
      INTO _order
      FROM public.storefront_orders
      WHERE id = _row.order_id;

    -- 1) Tenta consumir do Pack se a entrega for via pack
    IF _order.delivery_source = 'pack' THEN
      BEGIN
        SELECT public.pack_try_consume_sale_credit(
          _reseller_id, _row.order_id, 'Liberação venda aguardando: pack'
        ) INTO _pack_res;
      EXCEPTION WHEN OTHERS THEN
        _pack_res := -1;
      END;
      IF _pack_res >= 0 THEN
        _used := 'pack';
      END IF;
    END IF;

    -- 2) Fallback: tenta debitar do saldo
    IF _used IS NULL THEN
      BEGIN
        SELECT public.debit_reseller_balance(
          _reseller_id, _row.cost_cents, 'order_debit',
          'Liberação venda aguardando saldo', _row.order_id
        ) INTO _ok;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.pending_storefront_charges
        SET attempts = attempts + 1, attempted_at = now(), last_error = SQLERRM
        WHERE id = _row.id;
        EXIT;
      END;

      IF _ok THEN
        _used := 'balance';
        PERFORM public.add_reseller_spent(_reseller_id, _row.cost_cents);
      END IF;
    END IF;

    IF _used IS NULL THEN
      UPDATE public.pending_storefront_charges
      SET attempts = attempts + 1, attempted_at = now(),
          last_error = 'no_funds_no_pack'
      WHERE id = _row.id;
      EXIT; -- mantém ordem cronológica
    END IF;

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
