// Shared helpers to keep every cancel/refund path consistent so we never
// credit money into a reseller's balance when the original sale was paid
// with Pack credits (or vice-versa). Mirrors the logic already applied in
// cancel-sale + refund-sale-balance.

export function parseNotes(notes: unknown): any {
  if (!notes) return null;
  if (typeof notes === "object") return notes;
  if (typeof notes === "string") {
    try { return JSON.parse(notes); } catch { return null; }
  }
  return null;
}

// Returns { storefront_order_id, storefront_short_code } when the given
// `orders` row is actually a mirror of a Loja (storefront) sale.
export function detectStorefrontMirror(order: { notes?: unknown } | null | undefined) {
  if (!order) return null;
  const n = parseNotes(order.notes);
  if (!n) return null;
  const sfId = typeof n.storefront_order_id === "string" ? n.storefront_order_id : null;
  if (n.source === "storefront" && sfId) {
    return {
      storefront_order_id: sfId,
      storefront_short_code: typeof n.storefront_short_code === "string" ? n.storefront_short_code : null,
    };
  }
  return null;
}

// Detects if a sale (orders row OR storefront_orders row) was paid via the
// reseller Pack (pre-paid license credits) — either by looking at the ledger
// for a consume/sale_consume against the sale, or by the delivery_source
// metadata written at sale time.
export async function detectPackOrigin(
  svc: any,
  sale: { id: string; delivery_source?: string | null; notes?: unknown },
  saleType: "storefront" | "manual",
): Promise<{ isPack: boolean; packConsumeId: string | null; alreadyRefundedInPack: boolean }> {
  const { data: packConsume } = await svc
    .from("reseller_pack_ledger")
    .select("id")
    .eq("order_id", sale.id)
    .in("kind", ["consume", "sale_consume"])
    .limit(1)
    .maybeSingle();

  const n = parseNotes((sale as any).notes);
  const paidWithPackByMetadata = saleType === "storefront"
    ? sale.delivery_source === "pack"
    : n?.delivery_source === "pack";

  const isPack = Boolean(packConsume) || Boolean(paidWithPackByMetadata);

  const { data: existingRefund } = await svc
    .from("reseller_pack_ledger")
    .select("id")
    .eq("order_id", sale.id)
    .eq("kind", "sale_refund")
    .limit(1)
    .maybeSingle();

  return {
    isPack,
    packConsumeId: (packConsume as any)?.id ?? null,
    alreadyRefundedInPack: Boolean(existingRefund),
  };
}