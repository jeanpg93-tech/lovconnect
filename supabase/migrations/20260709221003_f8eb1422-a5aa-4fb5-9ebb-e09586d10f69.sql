UPDATE public.claude_orders co
SET reseller_id = r.id
FROM public.resellers r
WHERE co.reseller_id IS NULL
  AND co.is_manager_manual = true
  AND co.is_trial = true
  AND co.manager_user_id = r.user_id;