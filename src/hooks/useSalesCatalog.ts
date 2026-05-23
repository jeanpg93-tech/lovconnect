import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CreditPackOption = {
  plan_id: string;
  credits_amount: number;
  label: string;
  suggested_price_cents: number; // preço Partner (= Ouro) por padrão
  suggested_cost_cents: number; // custo provedor (último observado)
};

export type LicenseOption = {
  license_type: string;
  label: string;
  suggested_price_cents: number;
};

const LICENSE_LABELS: Record<string, string> = {
  "1d": "Licença PRO 1 dia",
  "7d": "Licença PRO 7 dias",
  "15d": "Licença PRO 15 dias",
  "30d": "Licença PRO 30 dias",
  pro_1d: "Licença PRO 1 dia",
  pro_7d: "Licença PRO 7 dias",
  pro_15d: "Licença PRO 15 dias",
  pro_30d: "Licença PRO 30 dias",
  lifetime: "Licença Vitalícia",
  trial: "Trial",
};

export function useSalesCatalog() {
  const [creditPacks, setCreditPacks] = useState<CreditPackOption[]>([]);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 1) Pacotes de crédito ativos
      const { data: plans } = await supabase
        .from("credit_pricing_plans")
        .select("id, credits_amount, label, price_cents, is_active")
        .eq("is_active", true)
        .order("credits_amount", { ascending: true });

      // 2) Tier Ouro (usado como preço Partner por padrão — fallback do sistema)
      const { data: tiers } = await supabase
        .from("reseller_tiers")
        .select("id, slug, name")
        .eq("is_active", true);
      const ouro = (tiers || []).find(
        (t: any) => t.slug === "ouro" || t.name?.toLowerCase().includes("ouro"),
      );

      // 3) Preços do tier Ouro
      let tierPrices: Record<string, number> = {};
      if (ouro) {
        const { data: tcp } = await supabase
          .from("tier_credit_prices")
          .select("plan_id, price_cents")
          .eq("tier_id", ouro.id)
          .eq("is_active", true);
        (tcp || []).forEach((r: any) => {
          tierPrices[r.plan_id] = Number(r.price_cents || 0);
        });
      }

      // 4) Custo provedor: pega o cost_cents mais recente por credits_amount
      const { data: purchases } = await supabase
        .from("reseller_credit_purchases")
        .select("credits, cost_cents, created_at")
        .not("cost_cents", "is", null)
        .gt("cost_cents", 0)
        .order("created_at", { ascending: false })
        .limit(500);
      const costByCredits: Record<number, number> = {};
      (purchases || []).forEach((p: any) => {
        if (!(p.credits in costByCredits)) {
          costByCredits[p.credits] = Number(p.cost_cents || 0);
        }
      });

      const packs: CreditPackOption[] = (plans || []).map((p: any) => ({
        plan_id: p.id,
        credits_amount: p.credits_amount,
        label: p.label || `${p.credits_amount} créditos`,
        suggested_price_cents:
          tierPrices[p.id] || Number(p.price_cents || 0) || 0,
        suggested_cost_cents: costByCredits[p.credits_amount] || 0,
      }));
      setCreditPacks(packs);

      // 5) Licenças — extrai tipos e preço médio recente do histórico
      const { data: orders } = await supabase
        .from("storefront_orders")
        .select("license_type, price_cents, created_at")
        .not("license_type", "is", null)
        .neq("license_type", "credits")
        .gt("price_cents", 0)
        .order("created_at", { ascending: false })
        .limit(500);
      const seen: Record<string, { sum: number; n: number; last: number }> = {};
      (orders || []).forEach((o: any) => {
        const k = o.license_type;
        if (!seen[k]) seen[k] = { sum: 0, n: 0, last: Number(o.price_cents) };
        seen[k].sum += Number(o.price_cents || 0);
        seen[k].n += 1;
      });
      // Garante os tipos comuns mesmo sem histórico
      ["1d", "7d", "15d", "30d", "lifetime"].forEach((t) => {
        if (!seen[t]) seen[t] = { sum: 0, n: 0, last: 0 };
      });
      const lics: LicenseOption[] = Object.entries(seen).map(([k, v]) => ({
        license_type: k,
        label: LICENSE_LABELS[k] || `Licença ${k}`,
        suggested_price_cents: v.last || (v.n > 0 ? Math.round(v.sum / v.n) : 0),
      }));
      // Ordena por preço sugerido
      lics.sort((a, b) => a.suggested_price_cents - b.suggested_price_cents);
      setLicenses(lics);

      setLoading(false);
    })();
  }, []);

  return { creditPacks, licenses, loading };
}