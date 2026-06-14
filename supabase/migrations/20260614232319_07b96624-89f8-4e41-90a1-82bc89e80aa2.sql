
-- Restrict column-level access on recharge_plans so internal cost/email fields
-- are not exposed to anon/authenticated. Edge functions use service_role and keep full access.
REVOKE SELECT ON public.recharge_plans FROM anon, authenticated;

GRANT SELECT (id, name, description, duration_days, credits_per_day, total_credits_cap, delivery_hour, is_active, created_at, updated_at)
  ON public.recharge_plans TO anon, authenticated;
