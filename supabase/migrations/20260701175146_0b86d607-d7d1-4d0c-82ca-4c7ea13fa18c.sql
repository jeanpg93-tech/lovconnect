
-- 1) claude_plan_prices: hide cost_cents from authenticated/anon
REVOKE SELECT ON public.claude_plan_prices FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='claude_plan_prices'
     AND column_name NOT IN ('cost_cents');
  EXECUTE format('GRANT SELECT (%s) ON public.claude_plan_prices TO authenticated', cols);
END $$;

-- 2) orders.provider_response
REVOKE SELECT ON public.orders FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders'
     AND column_name NOT IN ('provider_response');
  EXECUTE format('GRANT SELECT (%s) ON public.orders TO authenticated', cols);
END $$;

-- 3) claude_orders.provider_response
REVOKE SELECT ON public.claude_orders FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='claude_orders'
     AND column_name NOT IN ('provider_response');
  EXECUTE format('GRANT SELECT (%s) ON public.claude_orders TO authenticated', cols);
END $$;

-- 4) storefront_orders.raw_response
REVOKE SELECT ON public.storefront_orders FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='storefront_orders'
     AND column_name NOT IN ('raw_response');
  EXECUTE format('GRANT SELECT (%s) ON public.storefront_orders TO authenticated', cols);
END $$;

-- 5) reseller_credit_purchases.provider_response
REVOKE SELECT ON public.reseller_credit_purchases FROM authenticated, anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='reseller_credit_purchases'
     AND column_name NOT IN ('provider_response');
  EXECUTE format('GRANT SELECT (%s) ON public.reseller_credit_purchases TO authenticated', cols);
END $$;

-- 6) reseller_recharge_plan_prices.cost_cents (anon)
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM anon;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='reseller_recharge_plan_prices'
     AND column_name NOT IN ('cost_cents');
  EXECUTE format('GRANT SELECT (%s) ON public.reseller_recharge_plan_prices TO anon', cols);
END $$;

-- 7) resellers: only public-facing columns for anon
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active, recharge_plans_enabled, claude_enabled) ON public.resellers TO anon;

-- 8) extension-files storage: require ownership
DROP POLICY IF EXISTS "Autenticados baixam arquivos de extensões ativas" ON storage.objects;

CREATE POLICY "Owners baixam arquivos de extensões"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'extension-files'
  AND (
    EXISTS (
      SELECT 1
        FROM public.extensions e
        JOIN public.client_extensions ce ON ce.extension_id = e.id
       WHERE e.file_path = objects.name
         AND e.is_active = true
         AND ce.client_id = auth.uid()
         AND (ce.expires_at IS NULL OR ce.expires_at > now())
    )
    OR EXISTS (
      SELECT 1
        FROM public.extensions e
        JOIN public.reseller_extensions re ON re.extension_id = e.id
        JOIN public.resellers r ON r.id = re.reseller_id
       WHERE e.file_path = objects.name
         AND e.is_active = true
         AND r.user_id = auth.uid()
    )
  )
);
