CREATE POLICY "claude_overrides reseller insert own" ON public.claude_reseller_price_overrides
FOR INSERT TO authenticated
WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "claude_overrides reseller update own" ON public.claude_reseller_price_overrides
FOR UPDATE TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()))
WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "claude_overrides reseller delete own" ON public.claude_reseller_price_overrides
FOR DELETE TO authenticated
USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));