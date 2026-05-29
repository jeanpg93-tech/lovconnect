-- =========================================================
-- Fase 1: Fundação do modo Mensalista
-- =========================================================

-- 1) Campos novos em resellers
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS subscription_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_onboarding_completed boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resellers_billing_mode_check'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_billing_mode_check
      CHECK (billing_mode IN ('normal','subscription'));
  END IF;
END $$;

-- 2) Recorrências (criada antes de charges pra FK)
CREATE TABLE IF NOT EXISTS public.reseller_subscription_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  day_of_month int NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  description text,
  warning_days_before int NOT NULL DEFAULT 5 CHECK (warning_days_before >= 0),
  is_active boolean NOT NULL DEFAULT true,
  next_generation_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_subscription_recurrences TO authenticated;
GRANT ALL ON public.reseller_subscription_recurrences TO service_role;

ALTER TABLE public.reseller_subscription_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente full access recurrences"
  ON public.reseller_subscription_recurrences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Reseller can view own recurrences"
  ON public.reseller_subscription_recurrences
  FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_recurrences_updated_at
  BEFORE UPDATE ON public.reseller_subscription_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Cobranças
CREATE TABLE IF NOT EXISTS public.reseller_subscription_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('monthly','installment','one_off')),
  description text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  provider text NOT NULL DEFAULT 'misticpay',
  provider_charge_id text,
  pix_payload text,
  pix_qr_base64 text,
  paid_at timestamptz,
  paid_method text,
  cancelled_at timestamptz,
  cancel_reason text,
  recurrence_id uuid REFERENCES public.reseller_subscription_recurrences(id) ON DELETE SET NULL,
  is_onboarding boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_charges_reseller_status
  ON public.reseller_subscription_charges(reseller_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_subscription_charges_provider
  ON public.reseller_subscription_charges(provider_charge_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_subscription_charges TO authenticated;
GRANT ALL ON public.reseller_subscription_charges TO service_role;

ALTER TABLE public.reseller_subscription_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente full access charges"
  ON public.reseller_subscription_charges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente'::public.app_role));

CREATE POLICY "Reseller can view own charges"
  ON public.reseller_subscription_charges
  FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_charges_updated_at
  BEFORE UPDATE ON public.reseller_subscription_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index pra consulta rápida de mensalistas bloqueados
CREATE INDEX IF NOT EXISTS idx_resellers_billing_mode
  ON public.resellers(billing_mode) WHERE billing_mode = 'subscription';