ALTER TABLE public.pricing_plans ADD COLUMN IF NOT EXISTS customer_price_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pricing_plans.customer_price_cents IS 'Preço sugerido ou exibido para o cliente final na loja pública.';