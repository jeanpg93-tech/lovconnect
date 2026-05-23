CREATE POLICY "Gerentes can view all provider credit orders"
ON public.provider_credit_orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'::app_role));