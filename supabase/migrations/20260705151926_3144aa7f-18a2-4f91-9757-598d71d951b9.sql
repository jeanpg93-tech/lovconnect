
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_has_value;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_has_value CHECK (
  extension_discount_pct IS NOT NULL
  OR credit_discount_pct IS NOT NULL
  OR recharge_bonus_pct IS NOT NULL
  OR activation_discount_pct IS NOT NULL
  OR activation_discount_cents IS NOT NULL
  OR activation_fixed_price_cents IS NOT NULL
  OR activation_bonus_cents IS NOT NULL
  OR activation_promote_to_tier_id IS NOT NULL
  OR activation_referral_extra_pct IS NOT NULL
  OR claude_discount_by_tier IS NOT NULL
);
