
-- 1) reseller_api_keys: revoke client SELECT on webhook_secret (server-only)
REVOKE SELECT (webhook_secret) ON public.reseller_api_keys FROM authenticated;
REVOKE SELECT (webhook_secret) ON public.reseller_api_keys FROM anon;

-- 2) reseller_license_prices: gate public reads by enabled storefront
DROP POLICY IF EXISTS "Público vê preços de licenças da loja" ON public.reseller_license_prices;
CREATE POLICY "Storefront license prices viewable when storefront enabled"
ON public.reseller_license_prices
FOR SELECT
USING (
  price_cents > 0
  AND EXISTS (
    SELECT 1 FROM public.reseller_storefronts s
    WHERE s.reseller_id = reseller_license_prices.reseller_id
      AND s.is_enabled = true
  )
);

-- 3) reseller_extension_prices: gate public reads by enabled storefront
DROP POLICY IF EXISTS "Público vê preços ativos da loja" ON public.reseller_extension_prices;
CREATE POLICY "Storefront extension prices viewable when storefront enabled"
ON public.reseller_extension_prices
FOR SELECT
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.reseller_storefronts s
    WHERE s.reseller_id = reseller_extension_prices.reseller_id
      AND s.is_enabled = true
  )
);

-- 4) trial_registrations: validate INSERTs to deter spam/bulk PII
DROP POLICY IF EXISTS "Anyone can create trial registrations" ON public.trial_registrations;
CREATE POLICY "Anyone can create valid trial registrations"
ON public.trial_registrations
FOR INSERT
WITH CHECK (
  name IS NOT NULL
  AND length(btrim(name)) BETWEEN 2 AND 120
  AND phone IS NOT NULL
  AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 8 AND 20
);
