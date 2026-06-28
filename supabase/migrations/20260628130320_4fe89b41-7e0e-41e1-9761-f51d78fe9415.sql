
ALTER TABLE public.claude_plan_prices
  ADD COLUMN IF NOT EXISTS reseller_cost_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS reseller_cost_markup_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reseller_cost_cents integer NOT NULL DEFAULT 0;

-- backfill: preço atual de venda vira o custo do revendedor (preserva comportamento)
UPDATE public.claude_plan_prices
   SET reseller_cost_cents = sale_price_cents
 WHERE reseller_cost_cents = 0;

ALTER TABLE public.claude_plan_prices
  ADD CONSTRAINT claude_plan_prices_reseller_cost_mode_chk
  CHECK (reseller_cost_mode IN ('fixed','markup_percent'));

-- Tabela de chaves de API do revendedor para Claude
CREATE TABLE IF NOT EXISTS public.reseller_claude_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label text,
  webhook_url text,
  webhook_secret text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reseller_claude_api_keys_reseller ON public.reseller_claude_api_keys(reseller_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_claude_api_keys TO authenticated;
GRANT ALL ON public.reseller_claude_api_keys TO service_role;

ALTER TABLE public.reseller_claude_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reseller_claude_keys reseller own"
  ON public.reseller_claude_api_keys
  FOR ALL
  TO authenticated
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'gerente'::app_role)
  )
  WITH CHECK (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'gerente'::app_role)
  );
