CREATE POLICY "Gerente atualiza todas compras de credito"
ON public.reseller_credit_purchases
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));