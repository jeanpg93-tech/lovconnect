
UPDATE public.claude_orders
   SET created_at = LEAST(
         COALESCE(code_revealed_at, updated_at, created_at),
         COALESCE(updated_at, created_at)
       )
 WHERE is_manager_manual = true
   AND code LIKE 'ACT-%'
   AND created_at > COALESCE(updated_at, now())
   AND updated_at IS NOT NULL;
