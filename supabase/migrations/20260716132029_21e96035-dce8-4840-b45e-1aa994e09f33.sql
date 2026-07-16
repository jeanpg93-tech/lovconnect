
-- 1. claude_orders: column-level REVOKE for sensitive columns
REVOKE SELECT (provider_api_key, provider_response, provider_user_id, code, customer_refund_pix_key, customer_refund_full_name)
  ON public.claude_orders FROM authenticated;
REVOKE SELECT (provider_api_key, provider_response, provider_user_id, code, customer_refund_pix_key, customer_refund_full_name)
  ON public.claude_orders FROM anon;

-- 2. Realtime publication: republish tables with column lists that exclude sensitive columns
ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders
  (api_key_id, balance_refunded_at, cancellation_status, cancelled_at, cancelled_by, client_id, client_ip,
   client_refund_endtoend_id, client_refund_error, client_refund_method, client_refund_pix_key, client_refunded_at,
   created_at, credit_amount, customer_id, error_message, extension_id, id, is_legacy, is_test, key_revoke_error,
   key_revoked_at, license_key, license_type, notes, price_cents, product_type, promotion_discount_cents,
   promotion_id, reseller_id, status, telegram_sale_notified_at, updated_at, user_agent);

ALTER PUBLICATION supabase_realtime DROP TABLE public.claude_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.claude_orders
  (cancel_attempts, cancel_request_note, cancel_requested_at, cancelled_at, code_revealed_at, copy_paste,
   cost_cents, created_at, customer_account_blocked_at, customer_email, customer_id, customer_identifier,
   customer_name, customer_refund_note, customer_refund_pix_key_type, customer_refunded_at, customer_refunded_by,
   customer_whatsapp, error_message, expired_at, id, is_manager_manual, is_renewal, is_trial, manager_user_id,
   paid_at, pix_expires_at, plan_code, profit_cents, provider_key_id, provider_transaction_id, qr_code_base64,
   redeemed_at, refund_waived, renewal_note, request_id, reseller_id, sale_price_cents, status,
   tokens_exhausted_at, trial_duration_minutes, trial_messages_limit, updated_at);

ALTER PUBLICATION supabase_realtime DROP TABLE public.reseller_credit_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_credit_purchases
  (alert_permissao_sent_at, alert_stuck_configurando_sent_at, api_key_id, balance_refunded_at,
   cancellation_status, cancelled_at, cancelled_by, client_refund_endtoend_id, client_refund_error,
   client_refund_method, client_refund_pix_key, client_refunded_at, cost_cents, created_at, credits,
   customer_name, customer_whatsapp, email_conta_lovable, error_message, id, is_test, price_cents,
   promotion_discount_cents, promotion_id, provider_pedido_id, reseller_id, status, storefront_order_id,
   telegram_last_state, telegram_message_id, tipo_entrega, updated_at, workspace_id, workspace_name);

-- 3. reseller_recharge_plan_prices: hide cost_cents from anon
REVOKE SELECT (cost_cents) ON public.reseller_recharge_plan_prices FROM anon;

-- 4. Security-definer views → security_invoker with column-level grants + anon RLS policies
ALTER VIEW public.resellers_public SET (security_invoker = true);
ALTER VIEW public.pricing_plans_public SET (security_invoker = true);
ALTER VIEW public.claude_plan_prices_public SET (security_invoker = true);

-- resellers: anon may only see the public projection of active resellers
DROP POLICY IF EXISTS "Anon can view active resellers (public projection)" ON public.resellers;
CREATE POLICY "Anon can view active resellers (public projection)"
  ON public.resellers FOR SELECT TO anon
  USING (is_active = true);
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;

-- pricing_plans: anon may only see the public projection of active plans
DROP POLICY IF EXISTS "Anon can view active pricing plans (public projection)" ON public.pricing_plans;
CREATE POLICY "Anon can view active pricing plans (public projection)"
  ON public.pricing_plans FOR SELECT TO anon
  USING (is_active = true);
REVOKE SELECT ON public.pricing_plans FROM anon;
GRANT SELECT (id, license_type, label, price_cents, customer_price_cents, min_price_cents, is_active, created_at, updated_at)
  ON public.pricing_plans TO anon;

-- claude_plan_prices: anon may only see the public projection
DROP POLICY IF EXISTS "Anon can view claude plan prices (public projection)" ON public.claude_plan_prices;
CREATE POLICY "Anon can view claude plan prices (public projection)"
  ON public.claude_plan_prices FOR SELECT TO anon
  USING (true);
REVOKE SELECT ON public.claude_plan_prices FROM anon;
GRANT SELECT (id, plan_code, sale_price_cents, is_active, sort_order, created_at, updated_at)
  ON public.claude_plan_prices TO anon;

-- Ensure the views themselves are selectable
GRANT SELECT ON public.resellers_public TO anon, authenticated;
GRANT SELECT ON public.pricing_plans_public TO anon, authenticated;
GRANT SELECT ON public.claude_plan_prices_public TO anon, authenticated;
