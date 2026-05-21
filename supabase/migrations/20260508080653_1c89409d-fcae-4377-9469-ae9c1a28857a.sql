
CREATE TABLE IF NOT EXISTS public.reseller_credit_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.reseller_api_keys(id) ON DELETE SET NULL,
  credits integer NOT NULL,
  price_cents integer NOT NULL,
  cost_cents integer,
  status text NOT NULL DEFAULT 'aguardando',
  tipo_entrega text,
  email_conta_lovable text,
  workspace_id text,
  workspace_name text,
  provider_pedido_id text,
  provider_response jsonb,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcp_reseller ON public.reseller_credit_purchases(reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcp_provider_pedido ON public.reseller_credit_purchases(provider_pedido_id);

ALTER TABLE public.reseller_credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê todas compras de credito"
  ON public.reseller_credit_purchases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Revendedor vê suas compras de credito"
  ON public.reseller_credit_purchases FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_rcp_updated
  BEFORE UPDATE ON public.reseller_credit_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
