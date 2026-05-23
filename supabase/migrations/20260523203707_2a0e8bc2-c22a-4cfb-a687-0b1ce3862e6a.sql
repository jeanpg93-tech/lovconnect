INSERT INTO public.reseller_credit_purchases
  (reseller_id, credits, price_cents, status, tipo_entrega, provider_pedido_id, provider_response, created_at, updated_at)
SELECT
  r.id AS reseller_id,
  pco.creditos,
  COALESCE(pco.preco_cents, 0) AS price_cents,
  COALESCE(pco.status, 'aguardando') AS status,
  'workspace_proprio' AS tipo_entrega,
  pco.pedido_id,
  pco.provider_response,
  pco.created_at,
  pco.updated_at
FROM public.provider_credit_orders pco
JOIN public.resellers r ON r.user_id = pco.user_id
LEFT JOIN public.reseller_credit_purchases rcp ON rcp.provider_pedido_id = pco.pedido_id
WHERE rcp.id IS NULL;