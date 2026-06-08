
ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS recharge_plan_id uuid REFERENCES public.recharge_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recharge_plan_subscription_id uuid REFERENCES public.reseller_recharge_plan_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_orders_recharge_plan
  ON public.storefront_orders(recharge_plan_id)
  WHERE recharge_plan_id IS NOT NULL;
