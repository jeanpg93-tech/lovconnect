UPDATE public.orders
SET status = 'reembolsado', updated_at = now()
WHERE id = '94ce7332-4022-4753-a143-40c6ceae7adb'
  AND status = 'completed';