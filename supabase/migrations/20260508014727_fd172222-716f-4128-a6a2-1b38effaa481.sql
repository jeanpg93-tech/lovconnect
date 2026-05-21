
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerentes select app_settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerentes insert app_settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerentes update app_settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerentes delete app_settings" ON public.app_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
