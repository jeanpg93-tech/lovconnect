-- =========================================================================
-- PHASE 1: Backbone do "Plano 3.000 Créditos"
-- =========================================================================

-- 1) Tipos enum --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.recharge_plan_status AS ENUM (
    'awaiting_owner','awaiting_confirm','active','paused','cancelled','completed','expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recharge_plan_delivery_status AS ENUM (
    'pending','delivered','skipped','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Catálogo (gerenciado pelo gerente) -------------------------------------
CREATE TABLE IF NOT EXISTS public.recharge_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  duration_days int NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  credits_per_day int NOT NULL DEFAULT 100 CHECK (credits_per_day > 0),
  total_credits_cap int NOT NULL DEFAULT 3000 CHECK (total_credits_cap > 0),
  delivery_hour int NOT NULL DEFAULT 21 CHECK (delivery_hour BETWEEN 0 AND 23),
  base_cost_cents bigint NOT NULL DEFAULT 0 CHECK (base_cost_cents >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.recharge_plans TO anon, authenticated;
GRANT ALL ON public.recharge_plans TO service_role;
ALTER TABLE public.recharge_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recharge_plans_select_all"
  ON public.recharge_plans FOR SELECT
  USING (true);

CREATE POLICY "recharge_plans_gerente_write"
  ON public.recharge_plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_recharge_plans_updated_at
  BEFORE UPDATE ON public.recharge_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Preço por revendedor ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reseller_recharge_plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.recharge_plans(id) ON DELETE CASCADE,
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),     -- definido pelo gerente
  sale_price_cents bigint CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0), -- definido pelo revendedor
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, plan_id)
);

GRANT SELECT, UPDATE ON public.reseller_recharge_plan_prices TO authenticated;
GRANT ALL ON public.reseller_recharge_plan_prices TO service_role;
ALTER TABLE public.reseller_recharge_plan_prices ENABLE ROW LEVEL SECURITY;

-- Revendedor vê seu próprio preço
CREATE POLICY "rrpp_select_own_or_gerente"
  ON public.reseller_recharge_plan_prices FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.resellers r
      WHERE r.id = reseller_recharge_plan_prices.reseller_id
        AND r.user_id = auth.uid()
    )
  );

-- Revendedor atualiza apenas sale_price_cents e is_active do seu próprio
CREATE POLICY "rrpp_update_own_reseller"
  ON public.reseller_recharge_plan_prices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resellers r
      WHERE r.id = reseller_recharge_plan_prices.reseller_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.resellers r
      WHERE r.id = reseller_recharge_plan_prices.reseller_id
        AND r.user_id = auth.uid()
    )
  );

-- Gerente faz tudo (insert/update/delete) — atribui custo e gerencia
CREATE POLICY "rrpp_gerente_all"
  ON public.reseller_recharge_plan_prices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_rrpp_updated_at
  BEFORE UPDATE ON public.reseller_recharge_plan_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_rrpp_reseller ON public.reseller_recharge_plan_prices(reseller_id);

-- 4) Assinaturas (1 instância por venda) ------------------------------------
CREATE TABLE IF NOT EXISTS public.reseller_recharge_plan_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.recharge_plans(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.reseller_customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_whatsapp text,

  -- Identificação Lovable
  owner_email_required text NOT NULL,   -- e-mail nosso (gerente) que o cliente adiciona como Owner
  workspace_name text,                  -- digitado pelo cliente, confirmado pelo gerente
  owner_email_added_at timestamptz,     -- preenchido quando cliente declara que adicionou

  -- Canal de origem
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','storefront','api')),
  source_reference_id uuid,             -- order_id da loja / id de chamada da API

  -- Token público p/ página /plano/:token
  order_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),

  status public.recharge_plan_status NOT NULL DEFAULT 'awaiting_owner',

  -- Valores travados no momento da venda
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),         -- debitado do revendedor
  sale_price_cents bigint NOT NULL CHECK (sale_price_cents >= 0), -- pago pelo cliente final
  duration_days int NOT NULL,
  credits_per_day int NOT NULL,
  total_credits_cap int NOT NULL,
  delivery_hour int NOT NULL DEFAULT 21,

  -- Datas-chave
  started_at timestamptz,
  ends_at timestamptz,
  awaiting_owner_expires_at timestamptz, -- created_at + 2h
  cancelled_at timestamptz,
  cancelled_reason text,
  completed_at timestamptz,
  paused_at timestamptz,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reseller_recharge_plan_subscriptions TO authenticated;
GRANT ALL ON public.reseller_recharge_plan_subscriptions TO service_role;
ALTER TABLE public.reseller_recharge_plan_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrps_select_own_or_gerente"
  ON public.reseller_recharge_plan_subscriptions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.resellers r
      WHERE r.id = reseller_recharge_plan_subscriptions.reseller_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "rrps_gerente_write"
  ON public.reseller_recharge_plan_subscriptions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_rrps_updated_at
  BEFORE UPDATE ON public.reseller_recharge_plan_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_rrps_reseller ON public.reseller_recharge_plan_subscriptions(reseller_id);
CREATE INDEX IF NOT EXISTS idx_rrps_status ON public.reseller_recharge_plan_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_rrps_token ON public.reseller_recharge_plan_subscriptions(order_token);
CREATE INDEX IF NOT EXISTS idx_rrps_ends_at ON public.reseller_recharge_plan_subscriptions(ends_at);

-- 5) Entregas diárias -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recharge_plan_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.reseller_recharge_plan_subscriptions(id) ON DELETE CASCADE,
  day_number int NOT NULL CHECK (day_number > 0),
  scheduled_date date NOT NULL,
  credits int NOT NULL CHECK (credits > 0),
  status public.recharge_plan_delivery_status NOT NULL DEFAULT 'pending',
  delivered_at timestamptz,
  delivered_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, day_number)
);

GRANT SELECT ON public.recharge_plan_deliveries TO authenticated;
GRANT ALL ON public.recharge_plan_deliveries TO service_role;
ALTER TABLE public.recharge_plan_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rpd_select_own_or_gerente"
  ON public.recharge_plan_deliveries FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.reseller_recharge_plan_subscriptions s
      JOIN public.resellers r ON r.id = s.reseller_id
      WHERE s.id = recharge_plan_deliveries.subscription_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "rpd_gerente_write"
  ON public.recharge_plan_deliveries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_rpd_updated_at
  BEFORE UPDATE ON public.recharge_plan_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_rpd_subscription ON public.recharge_plan_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_rpd_scheduled_date ON public.recharge_plan_deliveries(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_rpd_status ON public.recharge_plan_deliveries(status);

-- 6) Seed do plano padrão (inativo até gerente revisar) --------------------
INSERT INTO public.recharge_plans (name, description, duration_days, credits_per_day, total_credits_cap, delivery_hour, base_cost_cents, is_active)
SELECT
  'Plano 3.000 Créditos',
  'Recebe 100 créditos por dia durante 30 dias. Os créditos resetam diariamente (não acumulam). Total entregue no período: até 3.000 créditos.',
  30, 100, 3000, 21, 0, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.recharge_plans WHERE name = 'Plano 3.000 Créditos'
);
