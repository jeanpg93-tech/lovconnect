
-- Add global price to credit pricing plans
ALTER TABLE public.credit_pricing_plans
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0;

-- Per-tier override prices for credit packages
CREATE TABLE IF NOT EXISTS public.tier_credit_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier_id uuid NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.credit_pricing_plans(id) ON DELETE CASCADE,
  price_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tier_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_tier_credit_prices_tier ON public.tier_credit_prices(tier_id);

ALTER TABLE public.tier_credit_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia tier credit prices - select"
  ON public.tier_credit_prices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente gerencia tier credit prices - insert"
  ON public.tier_credit_prices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente gerencia tier credit prices - update"
  ON public.tier_credit_prices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Gerente gerencia tier credit prices - delete"
  ON public.tier_credit_prices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Revendedor ve precos credito do seu tier"
  ON public.tier_credit_prices FOR SELECT TO authenticated
  USING (tier_id = (SELECT (public.get_reseller_tier(r.id)).id FROM public.resellers r WHERE r.user_id = auth.uid() LIMIT 1));

-- Allow public read of active credit plans pricing already exists; add manager update
CREATE POLICY "Gerente atualiza credit pricing plans"
  ON public.credit_pricing_plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE TRIGGER trg_tier_credit_prices_updated
  BEFORE UPDATE ON public.tier_credit_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
