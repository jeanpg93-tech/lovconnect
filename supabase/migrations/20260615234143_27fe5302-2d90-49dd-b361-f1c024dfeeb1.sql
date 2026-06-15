DO $$
DECLARE
  _rid uuid := '1aae11bc-cc7f-4359-b0a0-c3d1acd7b7d6';
  _bad_orders uuid[] := ARRAY[
    '9eeaae62-9f56-4200-a885-e2c0eadb7a6d'::uuid,
    'daf7b403-fd46-4a02-9590-b7e9a3da6276'::uuid,
    '31e45bd6-fa15-4f64-b5ab-3387934bf1c5'::uuid,
    '41342a3d-6f77-44a4-8ab2-e3ebdecdc1c5'::uuid
  ];
  _new_balance integer;
  _oid uuid;
BEGIN
  UPDATE public.reseller_pack_balances
    SET credits = credits - 4,
        lifetime_consumed = lifetime_consumed + 4,
        updated_at = now()
    WHERE reseller_id = _rid
    RETURNING credits INTO _new_balance;

  FOREACH _oid IN ARRAY _bad_orders LOOP
    INSERT INTO public.reseller_pack_ledger
      (reseller_id, kind, delta_credits, balance_after, order_id, description)
    VALUES
      (_rid, 'admin_debit', -1, _new_balance, _oid,
       'Correção: estorno indevido em chave de teste (trial) revertido');
  END LOOP;
END $$;