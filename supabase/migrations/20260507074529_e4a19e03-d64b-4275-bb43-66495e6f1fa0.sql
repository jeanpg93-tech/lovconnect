ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resellers;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.resellers REPLICA IDENTITY FULL;