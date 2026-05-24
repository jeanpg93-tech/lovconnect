
-- 1) Tighten public storefront read on reseller_credit_prices
DROP POLICY IF EXISTS "Storefront credit prices are viewable by everyone" ON public.reseller_credit_prices;

CREATE POLICY "Storefront credit prices viewable when storefront enabled"
ON public.reseller_credit_prices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reseller_storefronts s
    WHERE s.reseller_id = reseller_credit_prices.reseller_id
      AND s.is_enabled = true
  )
);

-- 2) Restrict column-level SELECT on reseller_integrations to non-sensitive columns
REVOKE SELECT ON public.reseller_integrations FROM anon, authenticated;

GRANT SELECT (
  reseller_id,
  misticpay_enabled,
  evolution_enabled,
  evolution_base_url,
  evolution_instance,
  evolution_message_template,
  created_at,
  updated_at,
  instance_name,
  connection_status,
  last_connected_at,
  messages_sent_count,
  profile_name,
  profile_picture_url,
  profile_number,
  evolution_confirmation_template,
  lovable_credits_enabled,
  evolution_template_recharge,
  evolution_template_storefront
) ON public.reseller_integrations TO authenticated;
