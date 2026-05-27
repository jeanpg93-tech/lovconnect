// Shared helpers to compute promotion discounts/bonuses.
// Reads from the active promotion (public.get_active_promotion) with fallback
// to global_settings defaults. Pure DB RPC wrappers.

export type DiscountKind = "extension" | "credits";

export interface DiscountResult {
  finalCents: number;
  discountCents: number;
  promotionId: string | null;
}

export interface BonusResult {
  bonusCents: number;
  promotionId: string | null;
}

export async function computeDiscount(
  admin: any,
  baseCents: number,
  kind: DiscountKind,
): Promise<DiscountResult> {
  if (!baseCents || baseCents <= 0) {
    return { finalCents: baseCents || 0, discountCents: 0, promotionId: null };
  }
  try {
    const { data, error } = await admin.rpc("compute_promotion_discount", {
      _base_cents: baseCents,
      _kind: kind,
    });
    if (error) throw error;
    const row: any = Array.isArray(data) ? data[0] : data;
    return {
      finalCents: Number(row?.final_cents ?? baseCents),
      discountCents: Number(row?.discount_cents ?? 0),
      promotionId: row?.promotion_id ?? null,
    };
  } catch (e) {
    console.warn("computeDiscount fallback:", e);
    return { finalCents: baseCents, discountCents: 0, promotionId: null };
  }
}

export async function computeBonus(
  admin: any,
  amountCents: number,
): Promise<BonusResult> {
  if (!amountCents || amountCents <= 0) {
    return { bonusCents: 0, promotionId: null };
  }
  try {
    const { data, error } = await admin.rpc("compute_recharge_bonus", {
      _amount_cents: amountCents,
    });
    if (error) throw error;
    const row: any = Array.isArray(data) ? data[0] : data;
    return {
      bonusCents: Number(row?.bonus_cents ?? 0),
      promotionId: row?.promotion_id ?? null,
    };
  } catch (e) {
    console.warn("computeBonus fallback:", e);
    return { bonusCents: 0, promotionId: null };
  }
}
