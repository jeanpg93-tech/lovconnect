import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActivationPricing = {
  basePriceCents: number;
  finalPriceCents: number;
  bonusCents: number;
  balanceCreditCents: number;
  promotionId: string | null;
  hasDiscount: boolean;
  hasBonus: boolean;
};

const DEFAULT_BASE_CENTS = 30000;

export async function fetchActivationBaseCents(): Promise<number> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "activation_base_cents")
      .maybeSingle();
    const raw = (data as any)?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n >= 100 ? Math.round(n) : DEFAULT_BASE_CENTS;
  } catch {
    return DEFAULT_BASE_CENTS;
  }
}

/**
 * Calcula o preço da adesão considerando a promoção ativa.
 * Retorna `null` enquanto carrega.
 */
export function useActivationPricing(): ActivationPricing | null {
  const [pricing, setPricing] = useState<ActivationPricing | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const baseCents = await fetchActivationBaseCents();
      try {
        const { data, error } = await supabase.rpc("compute_activation_pricing", {
          _base_cents: baseCents,
        });
        if (!alive) return;
        const row: any = Array.isArray(data) ? data[0] : data;
        const finalC = Number(row?.final_price_cents ?? baseCents);
        const bonusC = Number(row?.bonus_cents ?? 0);
        const promo = row?.promotion_id ?? null;
        setPricing({
          basePriceCents: baseCents,
          finalPriceCents: error ? baseCents : finalC,
          bonusCents: error ? 0 : bonusC,
          balanceCreditCents: error ? baseCents : finalC + bonusC,
          promotionId: error ? null : promo,
          hasDiscount: !error && finalC < baseCents,
          hasBonus: !error && bonusC > 0,
        });
      } catch {
        if (!alive) return;
        setPricing({
          basePriceCents: baseCents,
          finalPriceCents: baseCents,
          bonusCents: 0,
          balanceCreditCents: baseCents,
          promotionId: null,
          hasDiscount: false,
          hasBonus: false,
        });
      }
    })();
    return () => { alive = false; };
  }, []);

  return pricing;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}