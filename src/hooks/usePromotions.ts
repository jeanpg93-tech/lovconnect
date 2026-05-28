import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PromotionLite = {
  id: string;
  name: string;
  status: string | null;
  credit_discount_pct: number | null;
  extension_discount_pct: number | null;
  recharge_bonus_pct: number | null;
};

/**
 * Carrega todas as promoções uma vez (cache de 10min) para resolver
 * `promotion_id -> nome` em badges. Inclui promoções terminadas/pausadas
 * para que vendas antigas ainda mostrem o nome correto.
 */
export function usePromotions() {
  return useQuery({
    queryKey: ["promotions-lite-all"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("id,name,status,credit_discount_pct,extension_discount_pct,recharge_bonus_pct");
      if (error) throw error;
      const map = new Map<string, PromotionLite>();
      (data ?? []).forEach((p: any) => map.set(p.id, p as PromotionLite));
      return map;
    },
  });
}

export function usePromotion(id: string | null | undefined) {
  const { data: map } = usePromotions();
  if (!id || !map) return null;
  return map.get(id) ?? null;
}