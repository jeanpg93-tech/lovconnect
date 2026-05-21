CREATE TABLE public.pricing_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  pricing_mode TEXT NOT NULL DEFAULT 'fixed',
  markup_percent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem planos ativos"
  ON public.pricing_plans FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente cria planos"
  ON public.pricing_plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente atualiza planos"
  ON public.pricing_plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE POLICY "Gerente remove planos"
  ON public.pricing_plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_pricing_plans_updated
  BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();