
REVOKE EXECUTE ON FUNCTION public.pack_credit_balance(UUID,INTEGER,TEXT,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pack_consume_credit(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pack_debit_balance(UUID,INTEGER,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pack_credit_balance(UUID,INTEGER,TEXT,UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.pack_consume_credit(UUID,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pack_debit_balance(UUID,INTEGER,TEXT,UUID) TO service_role;
