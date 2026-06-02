
CREATE TABLE public.user_presence (
  user_id UUID NOT NULL PRIMARY KEY,
  current_path TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_presence_last_seen ON public.user_presence(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_presence TO authenticated;
GRANT ALL ON public.user_presence TO service_role;

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own presence"
ON public.user_presence
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
ON public.user_presence
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Gerentes can view all presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
