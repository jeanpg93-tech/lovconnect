
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia avisos - select" ON public.announcements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia avisos - insert" ON public.announcements
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia avisos - update" ON public.announcements
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente gerencia avisos - delete" ON public.announcements
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Autenticados veem avisos ativos" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_announcements_active ON public.announcements (is_active, created_at DESC);

CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas leituras" ON public.announcement_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Usuário marca como lido" ON public.announcement_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Gerente vê todas leituras" ON public.announcement_reads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gerente'));

CREATE INDEX idx_announcement_reads_user ON public.announcement_reads (user_id);
