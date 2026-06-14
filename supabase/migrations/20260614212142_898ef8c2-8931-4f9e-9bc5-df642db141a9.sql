CREATE POLICY "Revendedor enfileira teste de webhook"
ON public.reseller_api_webhook_deliveries
FOR INSERT
TO authenticated
WITH CHECK (reseller_id = auth.uid());