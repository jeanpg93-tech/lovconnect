CREATE POLICY "Revendedor cria seus preços"
ON public.reseller_extension_prices
FOR INSERT
TO authenticated
WITH CHECK (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Revendedor atualiza seus preços"
ON public.reseller_extension_prices
FOR UPDATE
TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
)
WITH CHECK (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);

CREATE POLICY "Revendedor remove seus preços"
ON public.reseller_extension_prices
FOR DELETE
TO authenticated
USING (
  reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
);