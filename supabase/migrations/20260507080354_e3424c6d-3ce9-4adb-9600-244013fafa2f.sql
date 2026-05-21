CREATE POLICY "Gerente insere transações"
ON public.balance_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));