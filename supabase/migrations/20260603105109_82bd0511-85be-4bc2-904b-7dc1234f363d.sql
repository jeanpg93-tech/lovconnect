ALTER TABLE public.manual_financial_entries
  ADD COLUMN IF NOT EXISTS sort_order BIGINT;

UPDATE public.manual_financial_entries
  SET sort_order = EXTRACT(EPOCH FROM entry_date)::BIGINT * 1000 + EXTRACT(EPOCH FROM created_at)::BIGINT % 1000
  WHERE sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_manual_financial_entries_sort_order
  ON public.manual_financial_entries (sort_order DESC);