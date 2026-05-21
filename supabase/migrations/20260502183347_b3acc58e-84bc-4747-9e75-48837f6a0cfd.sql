CREATE TABLE IF NOT EXISTS public.reseller_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL,
  display_name text NOT NULL,
  whatsapp text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, whatsapp)
);

CREATE INDEX IF NOT EXISTS idx_reseller_customers_reseller ON public.reseller_customers(reseller_id);

ALTER TABLE public.reseller_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus contatos"
ON public.reseller_customers FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor cria seus contatos"
ON public.reseller_customers FOR INSERT TO authenticated
WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza seus contatos"
ON public.reseller_customers FOR UPDATE TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor remove seus contatos"
ON public.reseller_customers FOR DELETE TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos os contatos"
ON public.reseller_customers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER trg_reseller_customers_updated
BEFORE UPDATE ON public.reseller_customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.reseller_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);