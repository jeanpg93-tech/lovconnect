-- Adiciona campos para controle de chaves teste no revendedor
ALTER TABLE public.resellers 
ADD COLUMN IF NOT EXISTS test_keys_used_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_test_key_reset TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Função para resetar contagem de chaves teste diariamente (pode ser chamada via cron ou trigger)
CREATE OR REPLACE FUNCTION public.reset_daily_test_keys()
RETURNS void AS $$
BEGIN
  UPDATE public.resellers
  SET test_keys_used_today = 0,
      last_test_key_reset = now()
  WHERE last_test_key_reset < date_trunc('day', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
