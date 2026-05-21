GRANT EXECUTE ON FUNCTION public.debit_reseller_balance(uuid, bigint, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reseller_balance(uuid, bigint, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_reseller_spent(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_debit_reseller_balance(uuid, bigint, text, text, uuid) TO authenticated;