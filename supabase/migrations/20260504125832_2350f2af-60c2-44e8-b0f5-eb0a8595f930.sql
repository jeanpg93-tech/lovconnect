ALTER TABLE public.reseller_tier_state REPLICA IDENTITY FULL;
ALTER TABLE public.reseller_balances REPLICA IDENTITY FULL;
ALTER TABLE public.balance_transactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_tier_state; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reseller_balances; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_transactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;