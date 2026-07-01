-- Fase 3 v2: campos de PIX no claude_orders + novos status para o fluxo automático de renovação/checkout do cliente Claude.
ALTER TABLE public.claude_orders
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS copy_paste text,
  ADD COLUMN IF NOT EXISTS pix_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS claude_orders_provider_tx_idx
  ON public.claude_orders (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- Novos estados de ciclo de vida do pedido Claude:
--  awaiting_payment  → PIX gerado, esperando cliente pagar
--  awaiting_balance  → PIX pago, mas revendedor sem saldo — venda pausa até recarga
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='claude_order_status' AND e.enumlabel='awaiting_payment') THEN
    ALTER TYPE public.claude_order_status ADD VALUE 'awaiting_payment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='claude_order_status' AND e.enumlabel='awaiting_balance') THEN
    ALTER TYPE public.claude_order_status ADD VALUE 'awaiting_balance';
  END IF;
END$$;