ALTER TABLE public.reseller_recharge_plan_prices
  ADD COLUMN IF NOT EXISTS show_on_storefront boolean NOT NULL DEFAULT false;

UPDATE public.reseller_recharge_plan_prices
  SET show_on_storefront = true
  WHERE is_active = true AND sale_price_cents IS NOT NULL AND sale_price_cents > 0;