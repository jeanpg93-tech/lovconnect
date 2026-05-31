CREATE TABLE public.blocked_sale_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'sales_disabled',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blocked_sale_attempts_reseller_created
  ON public.blocked_sale_attempts (reseller_id, created_at DESC);

GRANT SELECT ON public.blocked_sale_attempts TO authenticated;
GRANT ALL ON public.blocked_sale_attempts TO service_role;

ALTER TABLE public.blocked_sale_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view all blocked attempts"
ON public.blocked_sale_attempts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Resellers can view their own blocked attempts"
ON public.blocked_sale_attempts
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.resellers r
  WHERE r.id = blocked_sale_attempts.reseller_id
    AND r.user_id = auth.uid()
));

ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_sale_attempts;