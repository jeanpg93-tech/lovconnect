
-- pricing_plans: hide cost_cents and markup_percent from non-manager readers
REVOKE SELECT ON public.pricing_plans FROM authenticated;
GRANT SELECT (
  id, license_type, label, price_cents, customer_price_cents,
  pricing_mode, is_active, min_price_cents, created_at, updated_at
) ON public.pricing_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_plans TO authenticated;

-- reseller_integrations: hide raw credentials from reseller-facing reads
REVOKE SELECT ON public.reseller_integrations FROM authenticated;
GRANT SELECT (
  reseller_id,
  misticpay_enabled,
  evolution_enabled,
  evolution_base_url,
  evolution_instance,
  evolution_message_template,
  evolution_confirmation_template,
  evolution_template_recharge,
  evolution_template_storefront,
  instance_name,
  connection_status,
  last_connected_at,
  messages_sent_count,
  profile_name,
  profile_picture_url,
  profile_number,
  lovable_credits_enabled,
  created_at,
  updated_at
) ON public.reseller_integrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reseller_integrations TO authenticated;
