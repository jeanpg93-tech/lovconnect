-- Função para buscar o ranking de depósitos de forma segura
CREATE OR REPLACE FUNCTION public.get_reseller_ranking_v2(start_date timestamp with time zone)
RETURNS TABLE (
  reseller_id UUID,
  display_name TEXT,
  total_spent_cents BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH deposits AS (
    -- Recargas pagas
    SELECT 
      ri.reseller_id, 
      SUM(ri.amount_cents)::BIGINT as amount
    FROM public.recharge_intents ri
    WHERE ri.paid_at IS NOT NULL 
      AND ri.paid_at >= start_date
    GROUP BY ri.reseller_id
    
    UNION ALL
    
    -- Transações de depósito direto
    SELECT 
      bt.reseller_id, 
      SUM(bt.amount_cents)::BIGINT as amount
    FROM public.balance_transactions bt
    WHERE bt.kind = 'deposit' 
      AND bt.created_at >= start_date
    GROUP BY bt.reseller_id
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
$$;

-- Conceder permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_reseller_ranking_v2(timestamp with time zone) TO authenticated;