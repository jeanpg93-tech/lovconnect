ALTER TABLE public.reseller_pack_ledger DROP CONSTRAINT IF EXISTS reseller_pack_ledger_kind_check;
ALTER TABLE public.reseller_pack_ledger ADD CONSTRAINT reseller_pack_ledger_kind_check
  CHECK (kind = ANY (ARRAY['purchase','consume','sale_consume','sale_refund','admin_credit','admin_debit','refund']));