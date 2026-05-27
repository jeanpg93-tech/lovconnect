
-- 1) Tabela de custos de licenças por tier e duração
CREATE TABLE IF NOT EXISTS public.tier_license_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.reseller_tiers(id) ON DELETE CASCADE,
  duration_code text NOT NULL CHECK (duration_code IN ('1d','7d','30d','90d','365d','lifetime')),
  price_cents bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, duration_code)
);

GRANT SELECT ON public.tier_license_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tier_license_prices TO authenticated;
GRANT ALL ON public.tier_license_prices TO service_role;

ALTER TABLE public.tier_license_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem custos de licença"
  ON public.tier_license_prices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerente insere custos de licença"
  ON public.tier_license_prices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente atualiza custos de licença"
  ON public.tier_license_prices FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente remove custos de licença"
  ON public.tier_license_prices FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE TRIGGER trg_tier_license_prices_updated
  BEFORE UPDATE ON public.tier_license_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed inicial (Bronze, Prata, Ouro) a partir dos valores atuais do app_settings
-- Bronze = 13c5f844-de96-4125-99b3-3d1efe72e914
-- Prata  = 5f18be43-43c7-45d6-b857-16c4d9b40fbd
-- Ouro   = 4e670a7f-921c-4ca1-8792-8eac2b4905ef
INSERT INTO public.tier_license_prices (tier_id, duration_code, price_cents) VALUES
  -- 1 dia
  ('13c5f844-de96-4125-99b3-3d1efe72e914','1d',1075),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','1d', 753),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','1d', 502),
  -- 7 dias
  ('13c5f844-de96-4125-99b3-3d1efe72e914','7d',1525),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','7d',1068),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','7d', 712),
  -- 30 dias
  ('13c5f844-de96-4125-99b3-3d1efe72e914','30d',2563),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','30d',1794),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','30d',1364),
  -- 90 dias
  ('13c5f844-de96-4125-99b3-3d1efe72e914','90d',4712),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','90d',3251),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','90d',1671),
  -- 365 dias
  ('13c5f844-de96-4125-99b3-3d1efe72e914','365d',5923),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','365d',4542),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','365d',2200),
  -- vitalício
  ('13c5f844-de96-4125-99b3-3d1efe72e914','lifetime',7480),
  ('5f18be43-43c7-45d6-b857-16c4d9b40fbd','lifetime',5263),
  ('4e670a7f-921c-4ca1-8792-8eac2b4905ef','lifetime',3550)
ON CONFLICT (tier_id, duration_code) DO NOTHING;

-- 3) RPC: regra única de custo de licença, com fallback para Ouro (não bloqueia venda)
CREATE OR REPLACE FUNCTION public.get_license_pack_cost(
  _reseller_id uuid,
  _duration_code text
) RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier_id uuid;
  _price bigint;
  _ouro_id constant uuid := '4e670a7f-921c-4ca1-8792-8eac2b4905ef';
BEGIN
  -- nível atual do revendedor
  SELECT id INTO _tier_id
  FROM public.get_reseller_tier(_reseller_id)
  LIMIT 1;

  -- 1) preço do nível do revendedor
  IF _tier_id IS NOT NULL THEN
    SELECT price_cents INTO _price
    FROM public.tier_license_prices
    WHERE tier_id = _tier_id
      AND duration_code = _duration_code
      AND is_active = true
    LIMIT 1;
    IF _price IS NOT NULL THEN RETURN _price; END IF;
  END IF;

  -- 2) fallback: preço do Ouro (não deixa a venda parar)
  SELECT price_cents INTO _price
  FROM public.tier_license_prices
  WHERE tier_id = _ouro_id
    AND duration_code = _duration_code
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(_price, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_license_pack_cost(uuid, text) TO authenticated, service_role, anon;
