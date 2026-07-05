import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles } from "lucide-react";

/**
 * Banner discreto que aparece para o revendedor quando existe uma promoção
 * Claude ativa e o nível dele tem desconto configurado. Explica que o custo
 * debitado da carteira já vem com o desconto aplicado.
 */
export default function ClaudePromoBanner({ className }: { className?: string }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<{ name: string; pct: number; tierName: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: promoData }, { data: r }] = await Promise.all([
        supabase.rpc("get_active_claude_promotion"),
        supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      const promo = Array.isArray(promoData) ? promoData[0] : promoData;
      if (!promo?.claude_discount_by_tier || !r?.id) return;
      const { data: tierData } = await supabase.rpc("get_reseller_tier", { _reseller_id: r.id });
      const tier = Array.isArray(tierData) ? tierData[0] : tierData;
      if (!tier?.slug) return;
      const map = promo.claude_discount_by_tier as Record<string, number>;
      const pct = Number(map[tier.slug] ?? 0);
      if (pct <= 0 || cancelled) return;
      setInfo({ name: promo.name, pct, tierName: (tier as any).name ?? tier.slug });
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!info) return null;
  return (
    <div className={`rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 flex items-start gap-2 ${className ?? ""}`}>
      <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
      <div className="text-xs leading-snug">
        <span className="font-semibold text-foreground">Promoção ativa: {info.name}</span>
        <span className="text-muted-foreground"> — seu nível <span className="font-medium text-foreground">{info.tierName}</span> tem </span>
        <span className="font-semibold text-violet-500">{info.pct}% de desconto</span>
        <span className="text-muted-foreground"> no custo Claude debitado da sua carteira a cada emissão/renovação de chave. O preço de venda ao seu cliente não muda.</span>
      </div>
    </div>
  );
}