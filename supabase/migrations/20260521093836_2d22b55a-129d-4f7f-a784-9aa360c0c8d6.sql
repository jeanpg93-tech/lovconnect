CREATE POLICY "Público vê preços de licenças da loja"
ON public.reseller_license_prices
FOR SELECT
TO anon, authenticated
USING (price_cents > 0);