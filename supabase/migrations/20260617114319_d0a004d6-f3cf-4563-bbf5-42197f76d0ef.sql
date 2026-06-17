
ALTER TABLE public.telegram_outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_telegram_outbox(_limit int DEFAULT 50)
RETURNS SETOF public.telegram_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.telegram_outbox t
  SET claimed_at = now()
  WHERE t.id IN (
    SELECT id FROM public.telegram_outbox
    WHERE sent_at IS NULL
      AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
    ORDER BY created_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING t.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_telegram_outbox(int) TO service_role;
