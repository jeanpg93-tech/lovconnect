import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ClaudePromoInfo = {
  promotionId: string;
  name: string;
  pct: number;
  tierSlug: string;
  tierName: string;
  endsAt: string | null;
};

/**
 * Retorna a promoção Claude ATIVA aplicada ao nível do revendedor logado.
 * Retorna null quando: não há promo, promo sem desconto para o nível dele,
 * ou o usuário não é revendedor.
 */
export function useClaudePromoForReseller() {
  const { user } = useAuth();
  const [info, setInfo] = useState<ClaudePromoInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setInfo(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: promoData }, { data: r }] = await Promise.all([
          supabase.rpc("get_active_claude_promotion"),
          supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle(),
        ]);
        const promo: any = Array.isArray(promoData) ? promoData[0] : promoData;
        if (!promo?.claude_discount_by_tier || !r?.id) {
          if (!cancelled) setInfo(null);
          return;
        }
        const { data: tierData } = await supabase.rpc("get_reseller_claude_tier", {
          _reseller_id: r.id,
        });
        const tier: any = Array.isArray(tierData) ? tierData[0] : tierData;
        if (!tier?.slug) {
          if (!cancelled) setInfo(null);
          return;
        }
        const map = promo.claude_discount_by_tier as Record<string, number>;
        const pct = Number(map[tier.slug] ?? 0);
        if (pct <= 0) {
          if (!cancelled) setInfo(null);
          return;
        }
        if (cancelled) return;
        setInfo({
          promotionId: promo.id,
          name: promo.name,
          pct,
          tierSlug: tier.slug,
          tierName: tier.name ?? tier.slug,
          endsAt: promo.ends_at ?? null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { info, loading };
}