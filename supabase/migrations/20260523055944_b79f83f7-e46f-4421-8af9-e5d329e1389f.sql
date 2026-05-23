CREATE TABLE public.manual_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('revenue','expense')),
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  category text,
  entry_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_financial_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerentes podem ver lancamentos" ON public.manual_financial_entries
  FOR SELECT USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerentes podem inserir lancamentos" ON public.manual_financial_entries
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerentes podem atualizar lancamentos" ON public.manual_financial_entries
  FOR UPDATE USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerentes podem excluir lancamentos" ON public.manual_financial_entries
  FOR DELETE USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE INDEX idx_manual_fin_entries_date ON public.manual_financial_entries(entry_date DESC);
CREATE INDEX idx_manual_fin_entries_type ON public.manual_financial_entries(entry_type);

CREATE TRIGGER trg_manual_fin_entries_updated_at
  BEFORE UPDATE ON public.manual_financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();