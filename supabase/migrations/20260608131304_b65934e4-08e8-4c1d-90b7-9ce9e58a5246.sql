
CREATE POLICY "Anon ve liberacao global de planos"
ON public.app_settings
FOR SELECT
TO anon
USING (key = 'recharge_plans_enabled_globally');
