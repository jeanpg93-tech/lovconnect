ALTER TABLE public.manual_financial_entries
  ADD COLUMN IF NOT EXISTS cost_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reference_kind text,
  ADD COLUMN IF NOT EXISTS reference_meta jsonb;