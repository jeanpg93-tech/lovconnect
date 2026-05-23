
DROP POLICY IF EXISTS "Anyone can create direct sales" ON public.direct_sales;

CREATE POLICY "Anyone can create direct sales"
ON public.direct_sales
FOR INSERT
WITH CHECK (
  length(trim(name)) BETWEEN 1 AND 150
  AND (email IS NULL OR (length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (phone IS NULL OR length(phone) <= 32)
  AND (plan_name IS NULL OR length(plan_name) <= 120)
  AND amount_cents > 0
  AND amount_cents <= 100000000
  AND status = 'pending'
  AND provider_transaction_id IS NULL
  AND raw_response IS NULL
);
