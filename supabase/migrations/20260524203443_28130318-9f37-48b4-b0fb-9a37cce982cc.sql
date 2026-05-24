DELETE FROM public.balance_transactions
WHERE id IN (
  'bd5209f2-bcf6-4098-b034-f4e66b44115f'::uuid -- placeholder, será substituído
)
  AND false;

-- Apaga pelos critérios exatos do estorno que inseri
DELETE FROM public.balance_transactions
WHERE reseller_id = 'dcf5995d-2dd4-4030-8ab1-483940e98c3a'
  AND kind = 'adjustment'
  AND amount_cents = 1050
  AND reference_id IN (
    'a84995fe-1a44-4cde-9d38-083b96b587d3'::uuid,
    '400e8721-29eb-43a6-a8b1-a44fbc0705fc'::uuid,
    '7585bcf2-020c-43a4-8b37-48508b63ce84'::uuid
  )
  AND description LIKE 'Estorno diferença Partner%';