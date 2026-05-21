
-- 1) Coluna de visibilidade no nível
ALTER TABLE public.reseller_tiers
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- 2) Atualiza policy de SELECT para revendedores não verem tiers ocultos
DROP POLICY IF EXISTS "Autenticados veem tiers" ON public.reseller_tiers;
CREATE POLICY "Autenticados veem tiers"
  ON public.reseller_tiers
  FOR SELECT
  TO authenticated
  USING (
    is_hidden = false
    OR public.has_role(auth.uid(), 'gerente'::public.app_role)
  );

-- 3) Tabela de preços por nível + extensão + tipo de licença
CREATE TABLE IF NOT EXISTS public.tier_extension_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE CASCADE,
  extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
  license_type TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tier_id, extension_id, license_type)
);

ALTER TABLE public.tier_extension_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente gerencia tier prices - select"
  ON public.tier_extension_prices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerente gerencia tier prices - insert"
  ON public.tier_extension_prices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerente gerencia tier prices - update"
  ON public.tier_extension_prices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));
CREATE POLICY "Gerente gerencia tier prices - delete"
  ON public.tier_extension_prices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role));

-- Revendedor pode ler os preços do SEU tier (necessário para mostrar valores no painel)
CREATE POLICY "Revendedor vê preços do seu tier"
  ON public.tier_extension_prices FOR SELECT TO authenticated
  USING (
    tier_id = (
      SELECT (public.get_reseller_tier(r.id)).id
      FROM public.resellers r
      WHERE r.user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE TRIGGER trg_tier_extension_prices_updated
  BEFORE UPDATE ON public.tier_extension_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tier_extension_prices_tier
  ON public.tier_extension_prices(tier_id);

-- 4) Cria o nível Partner (oculto)
INSERT INTO public.reseller_tiers
  (slug, name, color, min_spent_cents, discount_percent, recharge_bonus_percent,
   referral_commission_percent, test_keys_per_day, sort_order, is_active, is_hidden)
VALUES
  ('partner', 'Partner', '#a855f7', 0, 0, 0, 0, 50, 999, true, true)
ON CONFLICT DO NOTHING;
