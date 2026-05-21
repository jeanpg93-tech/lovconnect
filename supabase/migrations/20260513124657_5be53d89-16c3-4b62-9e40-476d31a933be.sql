
CREATE TABLE public.hwid_reset_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  license_key TEXT,
  license_id TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_hwid_reset_logs_reseller ON public.hwid_reset_logs(reseller_id, created_at DESC);
CREATE INDEX idx_hwid_reset_logs_user ON public.hwid_reset_logs(user_id, created_at DESC);

ALTER TABLE public.hwid_reset_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reset logs"
  ON public.hwid_reset_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Users can insert their own reset logs"
  ON public.hwid_reset_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
