ALTER VIEW public.claude_plan_prices_public SET (security_invoker = off);
GRANT SELECT ON public.claude_plan_prices_public TO anon, authenticated;