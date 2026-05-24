-- Estorno da diferença cobrada a mais nas 3 vendas do revendedor Partner luxoapplez
-- Cobrado: R$ 35,50 (preço Ouro fallback). Correto Partner (override atual): R$ 25,00. Diferença: R$ 10,50 por venda.
INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id)
VALUES
  ('dcf5995d-2dd4-4030-8ab1-483940e98c3a', 1050, 'adjustment', 'Estorno diferença Partner (QL-EC70624FB9524BFF8E6CC550): cobrado R$ 35,50 (fallback Ouro), correto R$ 25,00 (Partner)', 'a84995fe-1a44-4cde-9d38-083b96b587d3'),
  ('dcf5995d-2dd4-4030-8ab1-483940e98c3a', 1050, 'adjustment', 'Estorno diferença Partner (QL-3A848BAE2A62490ABD7EFC9E): cobrado R$ 35,50 (fallback Ouro), correto R$ 25,00 (Partner)', '400e8721-29eb-43a6-a8b1-a44fbc0705fc'),
  ('dcf5995d-2dd4-4030-8ab1-483940e98c3a', 1050, 'adjustment', 'Estorno diferença Partner (QL-1765CE6E45FE4CFB9281BF54): cobrado R$ 35,50 (fallback Ouro), correto R$ 25,00 (Partner)', '7585bcf2-020c-43a4-8b37-48508b63ce84');