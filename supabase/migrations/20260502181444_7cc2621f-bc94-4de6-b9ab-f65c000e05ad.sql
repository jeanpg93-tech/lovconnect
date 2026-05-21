ALTER TABLE public.reseller_integrations
  ADD COLUMN IF NOT EXISTS messages_sent_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS profile_number text;

CREATE OR REPLACE FUNCTION public.increment_evolution_messages_sent(_reseller_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.reseller_integrations
  SET messages_sent_count = COALESCE(messages_sent_count, 0) + 1,
      updated_at = now()
  WHERE reseller_id = _reseller_id;
$$;