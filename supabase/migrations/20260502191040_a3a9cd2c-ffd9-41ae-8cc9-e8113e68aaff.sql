-- Permitir reseller_extension_prices sem extensão (preços globais por licença)
ALTER TABLE public.reseller_extension_prices
  ALTER COLUMN extension_id DROP NOT NULL;

-- Garantir unicidade por revendedor + licença quando não houver extensão,
-- e por revendedor + extensão + licença quando houver.
CREATE UNIQUE INDEX IF NOT EXISTS reseller_extension_prices_unique_global
  ON public.reseller_extension_prices (reseller_id, license_type)
  WHERE extension_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reseller_extension_prices_unique_ext
  ON public.reseller_extension_prices (reseller_id, extension_id, license_type)
  WHERE extension_id IS NOT NULL;