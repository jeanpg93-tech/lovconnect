-- Configuração dos níveis
CREATE TABLE public.reseller_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  min_spent_cents BIGINT NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  recharge_bonus_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem tiers" ON public.reseller_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gerente insere tiers" ON public.reseller_tiers FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente atualiza tiers" ON public.reseller_tiers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente remove tiers" ON public.reseller_tiers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_tiers_updated_at BEFORE UPDATE ON public.reseller_tiers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.reseller_tiers (slug, name, color, min_spent_cents, discount_percent, recharge_bonus_percent, sort_order) VALUES
  ('bronze',   'Bronze',   '#cd7f32',      0, 0,  0,  1),
  ('prata',    'Prata',    '#c0c0c0',  50000, 3,  3,  2),
  ('ouro',     'Ouro',     '#ffd700', 200000, 7,  7,  3),
  ('diamante', 'Diamante', '#7ad8ff',1000000, 12, 12, 4);

-- Estado por revendedor
CREATE TABLE public.reseller_tier_state (
  reseller_id UUID PRIMARY KEY REFERENCES public.resellers(id) ON DELETE CASCADE,
  total_spent_cents BIGINT NOT NULL DEFAULT 0,
  forced_tier_id UUID REFERENCES public.reseller_tiers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_tier_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seu estado" ON public.reseller_tier_state FOR SELECT TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
CREATE POLICY "Gerente vê todos estados" ON public.reseller_tier_state FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente insere estado" ON public.reseller_tier_state FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente'));
CREATE POLICY "Gerente atualiza estado" ON public.reseller_tier_state FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_tier_state_updated_at BEFORE UPDATE ON public.reseller_tier_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Função: retorna o tier atual do revendedor
CREATE OR REPLACE FUNCTION public.get_reseller_tier(_reseller_id UUID)
RETURNS public.reseller_tiers
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _state RECORD;
  _tier public.reseller_tiers;
BEGIN
  SELECT * INTO _state FROM public.reseller_tier_state WHERE reseller_id = _reseller_id;
  IF _state.forced_tier_id IS NOT NULL THEN
    SELECT * INTO _tier FROM public.reseller_tiers WHERE id = _state.forced_tier_id AND is_active = true;
    IF FOUND THEN RETURN _tier; END IF;
  END IF;
  SELECT * INTO _tier FROM public.reseller_tiers
    WHERE is_active = true AND min_spent_cents <= COALESCE(_state.total_spent_cents, 0)
    ORDER BY min_spent_cents DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO _tier FROM public.reseller_tiers WHERE is_active = true ORDER BY min_spent_cents ASC LIMIT 1;
  END IF;
  RETURN _tier;
END;
$$;

-- Função: incrementa o gasto do revendedor (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.add_reseller_spent(_reseller_id UUID, _amount_cents BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _amount_cents <= 0 THEN RETURN; END IF;
  INSERT INTO public.reseller_tier_state (reseller_id, total_spent_cents)
    VALUES (_reseller_id, _amount_cents)
    ON CONFLICT (reseller_id) DO UPDATE
      SET total_spent_cents = public.reseller_tier_state.total_spent_cents + EXCLUDED.total_spent_cents,
          updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_reseller_spent(UUID, BIGINT) FROM PUBLIC, anon, authenticated;

-- Inicializa estado para revendedores existentes
INSERT INTO public.reseller_tier_state (reseller_id, total_spent_cents)
  SELECT id, 0 FROM public.resellers ON CONFLICT DO NOTHING;