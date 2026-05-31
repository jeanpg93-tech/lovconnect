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

const BASE_CENTS = 20000;

/**
 * Calcula o preço da adesão considerando a promoção ativa.
 * Retorna `null` enquanto carrega.
 */
export function useActivationPricing(): ActivationPricing | null {
  const [pricing, setPricing] = useState<ActivationPricing | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("compute_activation_pricing", {
          _base_cents: BASE_CENTS,
        });
        if (!alive) return;
        const row: any = Array.isArray(data) ? data[0] : data;
        const finalC = Number(row?.final_price_cents ?? BASE_CENTS);
        const bonusC = Number(row?.bonus_cents ?? 0);
        const promo = row?.promotion_id ?? null;
        setPricing({
          basePriceCents: BASE_CENTS,
          finalPriceCents: error ? BASE_CENTS : finalC,
          bonusCents: error ? 0 : bonusC,
          balanceCreditCents: error ? BASE_CENTS : finalC + bonusC,
          promotionId: error ? null : promo,
          hasDiscount: !error && finalC < BASE_CENTS,
          hasBonus: !error && bonusC > 0,
        });
      } catch {
        if (!alive) return;
        setPricing({
          basePriceCents: BASE_CENTS,
          finalPriceCents: BASE_CENTS,
          bonusCents: 0,
          balanceCreditCents: BASE_CENTS,
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