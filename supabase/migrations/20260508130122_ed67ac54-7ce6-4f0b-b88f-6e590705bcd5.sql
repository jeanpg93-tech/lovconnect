ALTER TABLE public.reseller_api_keys ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'keys';
UPDATE public.reseller_api_keys SET scope = 'recharges' WHERE label ILIKE 'API Recargas%' OR label ILIKE '%recarga%';
CREATE INDEX IF NOT EXISTS idx_reseller_api_keys_scope ON public.reseller_api_keys(reseller_id, scope);