
-- 1) claude_plan_prices
REVOKE SELECT ON public.claude_plan_prices FROM anon, authenticated;
GRANT SELECT (
  id, plan_code, markup_mode, markup_value_cents, sale_price_cents,
  is_active, sort_order, created_at, updated_at
) ON public.claude_plan_prices TO authenticated;
GRANT SELECT (
  plan_code, sale_price_cents, is_active, sort_order
) ON public.claude_plan_prices TO anon;
GRANT ALL ON public.claude_plan_prices TO service_role;

-- 2) orders
REVOKE SELECT ON public.orders FROM anon, authenticated;
GRANT SELECT (
  id, reseller_id, client_id, extension_id, license_type, price_cents,
  status, license_key, error_message, created_at, updated_at,
  customer_id, is_test, api_key_id, notes, is_legacy, product_type,
  credit_amount, cancellation_status, cancelled_at, cancelled_by,
  key_revoked_at, key_revoke_error, client_refund_method,
  client_refunded_at, client_refund_pix_key, client_refund_endtoend_id,
  client_refund_error, balance_refunded_at, promotion_id,
  promotion_discount_cents, telegram_sale_notified_at, client_ip, user_agent
) ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- 3) storefront_orders
REVOKE SELECT ON public.storefront_orders FROM anon, authenticated;
GRANT SELECT (
  id, reseller_id, extension_id, license_type, buyer_name, buyer_whatsapp,
  price_cents, status, provider, provider_transaction_id, qr_code_base64,
  copy_paste, license_key, error_message, paid_at, created_at, updated_at,
  is_legacy, product_type, credit_amount, delivery_type, invite_link,
  short_code, cost_cents, expires_at, cancellation_status, cancelled_at,
  cancelled_by, key_revoked_at, key_revoke_error, client_refund_method,
  client_refunded_at, client_refund_pix_key, client_refund_endtoend_id,
  client_refund_error, balance_refunded_at, promotion_id,
  promotion_discount_cents, delivery_source, fallback_from_pack,
  recharge_plan_id, recharge_plan_subscription_id, is_test
) ON public.storefront_orders TO authenticated;
GRANT ALL ON public.storefront_orders TO service_role;

CREATE OR REPLACE FUNCTION public.admin_storefront_order_raw_response(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gerente'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT raw_response INTO _payload FROM public.storefront_orders WHERE id = _id;
  RETURN _payload;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_storefront_order_raw_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storefront_order_raw_response(uuid) TO authenticated, service_role;

-- 4) activation_payments
REVOKE SELECT ON public.activation_payments FROM anon, authenticated;
GRANT SELECT (
  id, reseller_id, amount_cents, status, provider, provider_transaction_id,
  qr_code_base64, copy_paste, expires_at, proof_url, proof_note,
  reviewer_id, reviewer_note, reviewed_at, paid_at, activated_at,
  created_at, updated_at, promotion_id, original_amount_cents, bonus_cents
) ON public.activation_payments TO authenticated;
GRANT ALL ON public.activation_payments TO service_role;

-- 5) recharge_intents
REVOKE SELECT ON public.recharge_intents FROM anon, authenticated;
GRANT SELECT (
  id, reseller_id, amount_cents, status, provider, provider_transaction_id,
  qr_code_base64, copy_paste, payer_name, payer_document, bonus_cents,
  paid_at, created_at, updated_at, promotion_id
) ON public.recharge_intents TO authenticated;
GRANT ALL ON public.recharge_intents TO service_role;

-- 6) resellers: restrict anon to storefront-safe columns
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;
