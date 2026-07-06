
-- 1) claude_plan_prices: hide cost columns from authenticated (resellers)
REVOKE SELECT ON public.claude_plan_prices FROM authenticated;
GRANT SELECT (id, plan_code, markup_mode, markup_value_cents, sale_price_cents, is_active, created_at, updated_at, reseller_cost_mode, reseller_cost_markup_bps, sort_order) ON public.claude_plan_prices TO authenticated;

-- 2) Sensitive PIX/provider columns hidden from authenticated (and anon)
-- activation_payments: hide raw_response
REVOKE SELECT ON public.activation_payments FROM authenticated;
GRANT SELECT (id, reseller_id, amount_cents, status, provider, provider_transaction_id, qr_code_base64, copy_paste, expires_at, proof_url, proof_note, reviewer_id, reviewer_note, reviewed_at, paid_at, activated_at, created_at, updated_at, promotion_id, original_amount_cents, bonus_cents) ON public.activation_payments TO authenticated;

-- claude_orders: hide provider_response
REVOKE SELECT ON public.claude_orders FROM authenticated;
GRANT SELECT (id, reseller_id, plan_code, customer_identifier, cost_cents, sale_price_cents, profit_cents, provider_key_id, code, code_revealed_at, status, error_message, request_id, created_at, updated_at, customer_name, customer_whatsapp, cancelled_at, cancel_attempts, customer_email, redeemed_at, expired_at, tokens_exhausted_at, customer_id, renewal_note, is_renewal, provider_transaction_id, qr_code_base64, copy_paste, pix_expires_at, paid_at, cancel_requested_at, cancel_request_note, refund_waived, provider_user_id, provider_api_key, manager_user_id, is_manager_manual, customer_refund_full_name, customer_refund_pix_key, customer_refund_pix_key_type, customer_refunded_at, customer_refunded_by, customer_refund_note, is_trial, trial_duration_minutes, trial_messages_limit) ON public.claude_orders TO authenticated;

-- orders: hide provider_response
REVOKE SELECT ON public.orders FROM authenticated;
GRANT SELECT (id, reseller_id, client_id, extension_id, license_type, price_cents, status, license_key, error_message, created_at, updated_at, customer_id, is_test, api_key_id, notes, is_legacy, product_type, credit_amount, cancellation_status, cancelled_at, cancelled_by, key_revoked_at, key_revoke_error, client_refund_method, client_refunded_at, client_refund_pix_key, client_refund_endtoend_id, client_refund_error, balance_refunded_at, promotion_id, promotion_discount_cents, telegram_sale_notified_at, client_ip, user_agent) ON public.orders TO authenticated;

-- recharge_intents: hide raw_response, payer_document
REVOKE SELECT ON public.recharge_intents FROM authenticated;
GRANT SELECT (id, reseller_id, amount_cents, status, provider, provider_transaction_id, qr_code_base64, copy_paste, payer_name, bonus_cents, paid_at, created_at, updated_at, promotion_id) ON public.recharge_intents TO authenticated;

-- reseller_credit_purchases: hide provider_response
REVOKE SELECT ON public.reseller_credit_purchases FROM authenticated;
GRANT SELECT (id, reseller_id, api_key_id, credits, price_cents, cost_cents, status, tipo_entrega, email_conta_lovable, workspace_id, workspace_name, provider_pedido_id, error_message, created_at, updated_at, customer_name, customer_whatsapp, cancellation_status, cancelled_at, cancelled_by, client_refund_method, client_refunded_at, client_refund_pix_key, client_refund_endtoend_id, client_refund_error, balance_refunded_at, telegram_message_id, telegram_last_state, storefront_order_id, alert_permissao_sent_at, alert_stuck_configurando_sent_at, promotion_id, promotion_discount_cents, is_test) ON public.reseller_credit_purchases TO authenticated;

-- storefront_orders: hide raw_response
REVOKE SELECT ON public.storefront_orders FROM authenticated;
GRANT SELECT (id, reseller_id, extension_id, license_type, buyer_name, buyer_whatsapp, price_cents, status, provider, provider_transaction_id, qr_code_base64, copy_paste, license_key, error_message, paid_at, created_at, updated_at, is_legacy, product_type, credit_amount, delivery_type, invite_link, short_code, cost_cents, expires_at, cancellation_status, cancelled_at, cancelled_by, key_revoked_at, key_revoke_error, client_refund_method, client_refunded_at, client_refund_pix_key, client_refund_endtoend_id, client_refund_error, balance_refunded_at, promotion_id, promotion_discount_cents, delivery_source, fallback_from_pack, recharge_plan_id, recharge_plan_subscription_id, is_test) ON public.storefront_orders TO authenticated;

-- 3) resellers: restrict anon to public columns only
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;
