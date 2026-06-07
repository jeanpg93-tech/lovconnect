CREATE OR REPLACE FUNCTION public.get_reseller_ranking_v2(start_date timestamp with time zone)
 RETURNS TABLE(reseller_id uuid, display_name text, total_spent_cents bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH deposits AS (
    SELECT ri.reseller_id, SUM(ri.amount_cents)::BIGINT as amount
    FROM public.recharge_intents ri
    WHERE ri.paid_at IS NOT NULL AND ri.paid_at >= start_date
    GROUP BY ri.reseller_id

    UNION ALL

    SELECT bt.reseller_id, SUM(bt.amount_cents)::BIGINT as amount
    FROM public.balance_transactions bt
    WHERE bt.kind = 'deposit' AND bt.created_at >= start_date
    GROUP BY bt.reseller_id

    UNION ALL

    -- Compras de Packs pagas
    SELECT rpp.reseller_id, SUM(rpp.price_cents)::BIGINT as amount
    FROM public.reseller_pack_purchases rpp
    WHERE rpp.status = 'paid'
      AND rpp.paid_at IS NOT NULL
      AND rpp.paid_at >= start_date
    GROUP BY rpp.reseller_id
  )
  SELECT
    r.id as reseller_id,
    r.display_name,
    COALESCE(SUM(d.amount), 0)::BIGINT as total_spent_cents
  FROM public.resellers r
  LEFT JOIN deposits d ON r.id = d.reseller_id
  WHERE r.is_active = true
  GROUP BY r.id, r.display_name
  ORDER BY total_spent_cents DESC;
END;
$function$;