
CREATE TABLE public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('recharge','license')),
  reference_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, reference_id)
);

CREATE INDEX idx_refund_requests_reseller ON public.refund_requests(reseller_id);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus reembolsos"
  ON public.refund_requests FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos reembolsos"
  ON public.refund_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
