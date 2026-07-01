
REVOKE SELECT (cost_cents, profit_cents, provider_response) ON public.claude_orders FROM anon, authenticated;
REVOKE SELECT (cost_cents, reseller_cost_cents, reseller_cost_mode, reseller_cost_markup_bps, markup_mode, markup_value_cents) ON public.claude_plan_prices FROM anon, authenticated;
REVOKE SELECT (provider_response) ON public.orders FROM anon, authenticated;
REVOKE SELECT (cost_cents, markup_percent) ON public.pricing_plans FROM anon, authenticated;
REVOKE SELECT (email_convite_bot, provider_response) ON public.provider_credit_orders FROM anon, authenticated;
REVOKE SELECT (payer_name, payer_document, raw_response) ON public.recharge_intents FROM anon, authenticated;
REVOKE SELECT (cost_cents, provider_response) ON public.reseller_credit_purchases FROM anon, authenticated;
REVOKE SELECT (misticpay_client_secret, evolution_api_key, lovable_credits_api_key) ON public.reseller_integrations FROM anon, authenticated;
REVOKE SELECT (raw_response, cost_cents) ON public.storefront_orders FROM anon, authenticated;
