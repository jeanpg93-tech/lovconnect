DO $$
DECLARE
  r RECORD;
  _name TEXT;
  _amt TEXT;
BEGIN
  FOR r IN
    SELECT bt.*, res.display_name AS reseller_name
    FROM public.balance_transactions bt
    LEFT JOIN public.resellers res ON res.id = bt.reseller_id
    WHERE bt.kind = 'license_purchase'
      AND bt.created_at >= '2026-05-28 14:00:00+00'
      AND bt.created_at < now()
    ORDER BY bt.created_at ASC
  LOOP
    _amt := 'R$ ' || to_char(ABS(r.amount_cents)::numeric/100.0, 'FM999G990D00');
    PERFORM public.telegram_enqueue(
      '🛒 <b>Venda de Licença</b> (reenvio)' || E'\n' ||
      '👨‍💼 Revendedor: ' || COALESCE(r.reseller_name,'—') || E'\n' ||
      '💵 Valor: ' || _amt || E'\n' ||
      '📦 ' || COALESCE(r.description,'Licença') || E'\n' ||
      '🕒 ' || to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')
    );
  END LOOP;
END $$;