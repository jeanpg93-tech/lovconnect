
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS claude_enabled boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE public.claude_plan_code AS ENUM ('mini_token','medium_token','mini_subscription','medium_subscription');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.claude_markup_mode AS ENUM ('percent','fixed_add','final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.claude_order_status AS ENUM ('pending','issued','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.claude_compute_sale_price(
  cost_cents integer,
  mode public.claude_markup_mode,
  value_cents integer
) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE mode
    WHEN 'percent'   THEN GREATEST(0, (cost_cents * (10000 + value_cents) / 10000)::int)
    WHEN 'fixed_add' THEN GREATEST(0, cost_cents + value_cents)
    WHEN 'final'     THEN GREATEST(0, value_cents)
  END
$$;

CREATE TABLE IF NOT EXISTS public.claude_plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code public.claude_plan_code NOT NULL UNIQUE,
  cost_cents integer NOT NULL DEFAULT 0,
  markup_mode public.claude_markup_mode NOT NULL DEFAULT 'percent',
  markup_value_cents integer NOT NULL DEFAULT 3000,
  sale_price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.claude_plan_prices TO authenticated;
GRANT ALL ON public.claude_plan_prices TO service_role;
ALTER TABLE public.claude_plan_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claude_plan_prices read all authenticated"
  ON public.claude_plan_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "claude_plan_prices manager write"
  ON public.claude_plan_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE TABLE IF NOT EXISTS public.claude_reseller_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  plan_code public.claude_plan_code NOT NULL,
  markup_mode public.claude_markup_mode NOT NULL DEFAULT 'percent',
  markup_value_cents integer NOT NULL DEFAULT 0,
  sale_price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, plan_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claude_reseller_price_overrides TO authenticated;
GRANT ALL ON public.claude_reseller_price_overrides TO service_role;
ALTER TABLE public.claude_reseller_price_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claude_overrides manager all"
  ON public.claude_reseller_price_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "claude_overrides reseller select own"
  ON public.claude_reseller_price_overrides FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.claude_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE RESTRICT,
  plan_code public.claude_plan_code NOT NULL,
  customer_identifier text,
  cost_cents integer NOT NULL DEFAULT 0,
  sale_price_cents integer NOT NULL DEFAULT 0,
  profit_cents integer NOT NULL DEFAULT 0,
  provider_key_id text,
  code text,
  code_revealed_at timestamptz,
  status public.claude_order_status NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  error_message text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_claude_orders_reseller_created
  ON public.claude_orders (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claude_orders_status
  ON public.claude_orders (status);
GRANT SELECT, INSERT, UPDATE ON public.claude_orders TO authenticated;
GRANT ALL ON public.claude_orders TO service_role;
ALTER TABLE public.claude_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claude_orders manager all"
  ON public.claude_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "claude_orders reseller select own"
  ON public.claude_orders FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "claude_orders reseller insert own"
  ON public.claude_orders FOR INSERT TO authenticated
  WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_claude_plan_prices_updated
  BEFORE UPDATE ON public.claude_plan_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_claude_overrides_updated
  BEFORE UPDATE ON public.claude_reseller_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_claude_orders_updated
  BEFORE UPDATE ON public.claude_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.claude_plan_prices (plan_code, cost_cents, markup_mode, markup_value_cents, sale_price_cents)
VALUES
  ('mini_token',          1500, 'percent', 3000, public.claude_compute_sale_price(1500,'percent',3000)),
  ('medium_token',        3000, 'percent', 3000, public.claude_compute_sale_price(3000,'percent',3000)),
  ('mini_subscription',   2500, 'percent', 3000, public.claude_compute_sale_price(2500,'percent',3000)),
  ('medium_subscription', 5000, 'percent', 3000, public.claude_compute_sale_price(5000,'percent',3000))
ON CONFLICT (plan_code) DO NOTHING;
