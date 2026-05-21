CREATE POLICY "Público vê preços ativos da loja"
ON public.reseller_extension_prices
FOR SELECT
TO anon, authenticated
USING (is_active = true);