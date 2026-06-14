GRANT SELECT, INSERT ON public.reseller_api_webhook_deliveries TO authenticated;
GRANT ALL ON public.reseller_api_webhook_deliveries TO service_role;

DROP POLICY IF EXISTS "Revendedor enfileira teste de webhook" ON public.reseller_api_webhook_deliveries;

CREATE POLICY "Revendedor enfileira teste de webhook"
ON public.reseller_api_webhook_deliveries
FOR INSERT
TO authenticated
WITH CHECK (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
  AND api_key_id IN (
    SELECT k.id
    FROM public.reseller_api_keys k
    JOIN public.resellers r ON r.id = k.reseller_id
    WHERE r.user_id = auth.uid()
      AND k.reseller_id = reseller_api_webhook_deliveries.reseller_id
      AND k.is_active = true
      AND k.revoked_at IS NULL
  )
);