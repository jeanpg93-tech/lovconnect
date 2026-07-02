DROP POLICY IF EXISTS "Resellers can manage their own credit prices" ON public.reseller_credit_prices;
CREATE POLICY "Resellers can manage their own credit prices"
ON public.reseller_credit_prices
FOR ALL
TO authenticated
USING (
  auth.uid() IN (
    SELECT r.user_id
    FROM public.resellers r
    WHERE r.id = reseller_credit_prices.reseller_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT r.user_id
    FROM public.resellers r
    WHERE r.id = reseller_credit_prices.reseller_id
  )
);

DROP POLICY IF EXISTS "Revendedores podem gerenciar seus próprios depoimentos" ON public.storefront_testimonials;
CREATE POLICY "Revendedores podem gerenciar seus próprios depoimentos"
ON public.storefront_testimonials
FOR ALL
TO authenticated
USING (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
)
WITH CHECK (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Revendedor vê seu saldo" ON public.reseller_pack_balances;
CREATE POLICY "Revendedor vê seu saldo"
ON public.reseller_pack_balances
FOR SELECT
TO authenticated
USING (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'gerente'::app_role)
);

DROP POLICY IF EXISTS "Revendedor vê seu extrato" ON public.reseller_pack_ledger;
CREATE POLICY "Revendedor vê seu extrato"
ON public.reseller_pack_ledger
FOR SELECT
TO authenticated
USING (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'gerente'::app_role)
);

DROP POLICY IF EXISTS "Revendedor vê suas compras" ON public.reseller_pack_purchases;
CREATE POLICY "Revendedor vê suas compras"
ON public.reseller_pack_purchases
FOR SELECT
TO authenticated
USING (
  reseller_id IN (
    SELECT r.id
    FROM public.resellers r
    WHERE r.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'gerente'::app_role)
);