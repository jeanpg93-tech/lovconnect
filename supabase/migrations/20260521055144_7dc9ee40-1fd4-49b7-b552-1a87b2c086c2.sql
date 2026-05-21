ALTER TABLE public.reseller_credit_purchases REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_credit_purchases;