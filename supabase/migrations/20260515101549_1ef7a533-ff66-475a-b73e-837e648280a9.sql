-- Create global settings table
CREATE TABLE public.global_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Policies for global settings
CREATE POLICY "Anyone can view global settings"
ON public.global_settings FOR SELECT
USING (true);

CREATE POLICY "Only managers can update global settings"
ON public.global_settings FOR UPDATE
USING (public.has_role(auth.uid(), 'gerente'))
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Only managers can insert global settings"
ON public.global_settings FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Initial values
INSERT INTO public.global_settings (key, value) VALUES
('extension_discount_pct', '0'),
('credit_discount_pct', '0'),
('recharge_bonus_pct', '0')
ON CONFLICT (key) DO NOTHING;

-- Audit logs for special actions
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Managers can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'gerente'));