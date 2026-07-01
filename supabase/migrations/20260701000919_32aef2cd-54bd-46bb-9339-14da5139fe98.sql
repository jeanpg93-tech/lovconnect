
-- 1) claude_customers
CREATE TABLE IF NOT EXISTS public.claude_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  whatsapp text,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claude_customers_reseller_email_unique UNIQUE (reseller_id, email)
);

CREATE INDEX IF NOT EXISTS idx_claude_customers_reseller ON public.claude_customers(reseller_id);
CREATE INDEX IF NOT EXISTS idx_claude_customers_auth_user ON public.claude_customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_claude_customers_email ON public.claude_customers(lower(email));

GRANT SELECT, INSERT, UPDATE ON public.claude_customers TO authenticated;
GRANT ALL ON public.claude_customers TO service_role;

ALTER TABLE public.claude_customers ENABLE ROW LEVEL SECURITY;

-- Gerente: tudo
CREATE POLICY "claude_customers manager all"
  ON public.claude_customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

-- Revendedor: seus próprios clientes
CREATE POLICY "claude_customers reseller select own"
  ON public.claude_customers FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "claude_customers reseller update own"
  ON public.claude_customers FOR UPDATE TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

-- Cliente final: só a própria linha
CREATE POLICY "claude_customers self select"
  ON public.claude_customers FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "claude_customers self update"
  ON public.claude_customers FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Trigger updated_at
CREATE TRIGGER trg_claude_customers_updated
  BEFORE UPDATE ON public.claude_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) claude_orders: vincular a customer_id
ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.claude_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claude_orders_customer ON public.claude_orders(customer_id);

-- Política extra: cliente final vê seus próprios pedidos (colunas seguras já filtradas pelo GRANT existente)
CREATE POLICY "claude_orders customer select own"
  ON public.claude_orders FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.claude_customers WHERE auth_user_id = auth.uid()
    )
  );
