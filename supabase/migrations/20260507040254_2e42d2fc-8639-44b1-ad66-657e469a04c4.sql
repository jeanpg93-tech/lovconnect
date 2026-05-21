ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

-- Tudo que já existe no banco veio do provedor antigo: marca como legado
UPDATE public.orders SET is_legacy = true WHERE is_legacy = false;
UPDATE public.storefront_orders SET is_legacy = true WHERE is_legacy = false;