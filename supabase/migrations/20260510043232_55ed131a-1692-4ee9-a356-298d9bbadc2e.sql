CREATE POLICY "Managers can manage all reseller credit prices"
ON public.reseller_credit_prices
FOR ALL
USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));