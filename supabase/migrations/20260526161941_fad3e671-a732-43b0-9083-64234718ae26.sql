DO $$
DECLARE
  _released uuid[];
BEGIN
  SELECT public.try_release_pending_orders('dcf5995d-2dd4-4030-8ab1-483940e98c3a') INTO _released;
  RAISE NOTICE 'released: %', _released;
END $$;