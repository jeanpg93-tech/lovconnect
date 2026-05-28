
-- 1) Esconder credenciais sensíveis de reseller_integrations dos clientes autenticados.
-- Edge functions usam service_role e continuam tendo acesso total.
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM authenticated;
REVOKE SELECT (misticpay_client_id, misticpay_client_secret, evolution_api_key, lovable_credits_api_key)
  ON public.reseller_integrations FROM anon;

-- 2) Esconder colunas internas de resellers dos demais usuários autenticados.
-- O dono ainda lê estes valores via edge function quando necessário; o cliente não precisa.
REVOKE SELECT (user_id, test_keys_used_today, test_keys_per_day_override, bonus_min_tier_id, last_test_key_reset)
  ON public.resellers FROM authenticated;
REVOKE SELECT (user_id, test_keys_used_today, test_keys_per_day_override, bonus_min_tier_id, last_test_key_reset)
  ON public.resellers FROM anon;
