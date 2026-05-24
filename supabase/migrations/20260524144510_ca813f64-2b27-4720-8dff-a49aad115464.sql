CREATE TABLE IF NOT EXISTS public.partner_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('credit','license')),
  pack_key text NOT NULL,
  old_price_cents bigint,
  new_price_cents bigint,
  action text NOT NULL CHECK (action IN ('set','clear','revert')),
  changed_by uuid,
  changed_by_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_price_history_reseller_created
  ON public.partner_price_history (reseller_id, created_at DESC);

ALTER TABLE public.partner_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê histórico de preços"
  ON public.partner_price_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente registra histórico de preços"
  ON public.partner_price_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));