import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCcw, Coins, Crown, Save, TrendingUp, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

type Plan = {
  id: string;
  credits_amount: number;
  label: string;
  price_cents: number;
  is_active: boolean;
};

type Tier = {
  id: string;
  name: string;
  slug: string;
  color: string;
  discount_percent: number;
  sort_order: number;
};

type TierPrice = {
  id?: string;
  tier_id: string;
  plan_id: string;
  price_cents: number;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseInput = (v: string): number => {
  const clean = v.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
};

const formatInput = (cents: number): string =>
  cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";

export default function GerenteValoresCreditos() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({}); // key: tierId:planId
  const [costs, setCosts] = useState<Record<number, number>>({}); // credits_amount -> cents
  const [tierEdits, setTierEdits] = useState<Record<string, string>>({});
  const [baseEdits, setBaseEdits] = useState<Record<string, string>>({}); // plan.id -> input
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Preços Partner (espelho — referência: Jean). Read-only.
  const [partnerPrices, setPartnerPrices] = useState<Record<number, number>>({}); // credits_amount -> cents
  const [partnerResellerName, setPartnerResellerName] = useState<string>("");

  const PARTNER_REF_RESELLER_ID = "68fddcfb-5e1f-492c-be75-9a8a3d2a63fa"; // Jean

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: pData }, { data: tData }, { data: tpData }] =
        await Promise.all([
          supabase
            .from("credit_pricing_plans")
            .select("*")
            .eq("is_active", true)
            .order("credits_amount", { ascending: true }),
          supabase.from("reseller_tiers").select("*").order("sort_order"),
          supabase.from("tier_credit_prices").select("*"),
        ]);

      const planList = (pData ?? []) as Plan[];
      setPlans(planList);
      setTiers(((tData ?? []) as Tier[]).filter((t) => t.slug !== "partner"));

      const map: Record<string, number> = {};
      (tpData ?? []).forEach((tp: any) => {
        map[`${tp.tier_id}:${tp.plan_id}`] = tp.price_cents;
      });
      setTierPrices(map);
      setTierEdits({});

      // ===== Preços Partner (espelho do Jean) =====
      // Regra: override do revendedor > tier_credit_prices do Ouro (fallback usado em /painel/gerente/partners)
      try {
        const ouroTier = ((tData ?? []) as Tier[]).find(
          (x: any) => x.slug === "ouro" || (x.name || "").toLowerCase().includes("ouro"),
        );
        const [{ data: refReseller }, { data: ovs }, ouroTcpRes] = await Promise.all([
          supabase
            .from("resellers")
            .select("display_name")
            .eq("id", PARTNER_REF_RESELLER_ID)
            .maybeSingle(),
          supabase
            .from("reseller_credit_cost_overrides")
            .select("credits_amount,price_cents,is_active")
            .eq("reseller_id", PARTNER_REF_RESELLER_ID)
            .eq("is_active", true),
          ouroTier
            ? supabase
                .from("tier_credit_prices")
                .select("price_cents,is_active,credit_pricing_plans!inner(credits_amount)")
                .eq("tier_id", ouroTier.id)
                .eq("is_active", true)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        setPartnerResellerName((refReseller as any)?.display_name || "Jean");
        const ouroMap: Record<number, number> = {};
        ((ouroTcpRes as any).data ?? []).forEach((row: any) => {
          const amount = row.credit_pricing_plans?.credits_amount;
          if (amount != null && row.price_cents > 0) ouroMap[amount] = row.price_cents;
        });
        const ovMap: Record<number, number> = {};
        (ovs ?? []).forEach((o: any) => {
          if (o.price_cents > 0) ovMap[o.credits_amount] = o.price_cents;
        });
        const partnerMap: Record<number, number> = {};
        planList.forEach((p) => {
          partnerMap[p.credits_amount] =
            ovMap[p.credits_amount] ?? ouroMap[p.credits_amount] ?? 0;
        });
        setPartnerPrices(partnerMap);
      } catch (e) {
        console.warn("partner mirror err", e);
      }

      // Fetch provider cost for each plan via /orcamento
      const costMap: Record<number, number> = {};
      await Promise.all(
        planList.map(async (p) => {
          try {
            const { data, error } = await invokeAuthenticatedFunction(
              `lovable-credits-api?action=quote&credits=${p.credits_amount}`,
              { method: "GET" }
            );
            if (error) return;
            const cents =
              data?.data?.precoCentavos ??
              data?.precoCentavos ??
              (typeof data?.data?.precoReais === "string"
                ? Math.round(parseFloat(data.data.precoReais) * 100)
                : null);
            if (typeof cents === "number" && !isNaN(cents)) {
              costMap[p.credits_amount] = cents;
            }
          } catch (e) {
            console.warn("quote err", p.credits_amount, e);
          }
        })
      );
      setCosts(costMap);
    } catch (e: any) {
      toast.error("Erro ao carregar preços", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const getTierValue = (tier: Tier, plan: Plan) => {
    const k = `${tier.id}:${plan.id}`;
    return tierEdits[k] ?? formatInput(tierPrices[k] ?? 0);
  };

  const computeAutoFromDiscount = (tier: Tier, plan: Plan): number => {
    const base = costs[plan.credits_amount] ?? plan.price_cents;
    const discount = Number(tier.discount_percent) || 0;
    return Math.round(base * (1 + discount / 100));
  };

  const hasChanges = useMemo(
    () => Object.keys(tierEdits).length > 0 || Object.keys(baseEdits).length > 0,
    [tierEdits, baseEdits],
  );

  const saveAll = async () => {
    setSaving(true);
    try {
      const upserts: any[] = [];
      for (const [key, val] of Object.entries(tierEdits)) {
        const [tier_id, plan_id] = key.split(":");
        upserts.push({
          tier_id,
          plan_id,
          price_cents: parseInput(val),
        });
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("tier_credit_prices")
          .upsert(upserts, { onConflict: "tier_id,plan_id" });
        if (error) throw error;
      }

      // Preço Base por pacote (credit_pricing_plans.price_cents)
      for (const [planId, val] of Object.entries(baseEdits)) {
        const cents = parseInput(val);
        const { error } = await supabase
          .from("credit_pricing_plans")
          .update({ price_cents: cents })
          .eq("id", planId);
        if (error) throw error;
      }

      toast.success("Preços salvos com sucesso");
      setBaseEdits({});
      await loadAll();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const applyDiscountSuggestion = (tier: Tier, plan: Plan) => {
    const auto = computeAutoFromDiscount(tier, plan);
    setTierEdits((s) => ({ ...s, [`${tier.id}:${plan.id}`]: formatInput(auto) }));
  };

  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            Valores <span className="text-primary italic">Recargas</span>
          </h1>
        }
        description="Defina o preço base de cada pacote e o preço final por nível de revendedor."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAll}
              disabled={loading || saving}
              className="h-9 px-4 border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest rounded-xl"
            >
              <RefreshCcw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
              Recarregar
            </Button>
            <Button
              size="sm"
              onClick={saveAll}
              disabled={!hasChanges || saving || loading}
              className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest rounded-xl"
            >
              {saving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Salvar Alterações
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      ) : (
        <div className="relative rounded-3xl border border-white/5 bg-card/20 backdrop-blur-md overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                  <th className="px-6 py-5 font-bold">Pacote</th>
                  <th className="px-6 py-5 font-bold border-l border-white/5 bg-primary/5 text-center min-w-[160px]">
                    Preço Base
                  </th>
                  {tiers.map((t) => (
                    <th
                      key={t.id}
                      className="px-4 py-5 text-center font-bold min-w-[160px] border-l border-white/5"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <Crown className="h-3.5 w-3.5" style={{ color: t.color }} />
                          <span className="text-foreground tracking-tighter">{t.name}</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/50 normal-case tracking-normal font-normal">
                          desc. {Number(t.discount_percent).toFixed(0)}%
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-5 text-center font-bold min-w-[160px] border-l border-white/5 bg-emerald-500/5">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400 tracking-tighter">Partner</span>
                        <Lock className="h-3 w-3 text-muted-foreground/60" />
                      </div>
                      <Link
                        to="/painel/gerente/partners"
                        className="text-[9px] text-muted-foreground/60 hover:text-primary normal-case tracking-normal font-normal inline-flex items-center gap-1"
                        title="Alterar em /painel/gerente/partners"
                      >
                        ref: {partnerResellerName || "—"} <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-base text-foreground/90">
                          {p.label}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-muted-foreground/50 tracking-widest flex items-center gap-1.5">
                          <Coins className="h-3 w-3" /> {p.credits_amount} recargas
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 border-l border-white/5 bg-primary/5 text-center">
                      <div className="flex flex-col gap-1">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                            R$
                          </span>
                          <Input
                            inputMode="decimal"
                            value={baseEdits[p.id] ?? formatInput(p.price_cents)}
                            onChange={(e) =>
                              setBaseEdits((s) => ({ ...s, [p.id]: e.target.value }))
                            }
                            placeholder={
                              costs[p.credits_amount] != null
                                ? formatInput(costs[p.credits_amount])
                                : "0,00"
                            }
                            className="pl-9 h-10 text-right font-mono text-sm bg-background/40 border-white/10"
                          />
                        </div>
                        {costs[p.credits_amount] != null && (
                          <button
                            type="button"
                            onClick={() =>
                              setBaseEdits((s) => ({
                                ...s,
                                [p.id]: formatInput(costs[p.credits_amount]),
                              }))
                            }
                            className="text-[9px] font-mono text-muted-foreground/50 hover:text-primary transition-colors flex items-center justify-end gap-1 pr-1"
                            title="Usar valor atual do provedor"
                          >
                            <TrendingUp className="h-2.5 w-2.5" />
                            provedor: {fmt(costs[p.credits_amount])}
                          </button>
                        )}
                      </div>
                    </td>
                    {tiers.map((t) => {
                      const k = `${t.id}:${p.id}`;
                      const auto = computeAutoFromDiscount(t, p);
                      const current = parseInput(getTierValue(t, p));
                      return (
                        <td key={t.id} className="px-3 py-4 border-l border-white/5">
                          <div className="flex flex-col gap-1">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                                R$
                              </span>
                              <Input
                                inputMode="decimal"
                                value={getTierValue(t, p)}
                                onChange={(e) =>
                                  setTierEdits((s) => ({ ...s, [k]: e.target.value }))
                                }
                                placeholder={formatInput(auto) || "0,00"}
                                className="pl-9 h-10 text-right font-mono text-sm bg-background/40 border-white/10"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => applyDiscountSuggestion(t, p)}
                              className="text-[9px] font-mono text-muted-foreground/50 hover:text-primary transition-colors flex items-center justify-end gap-1 pr-1"
                              title="Aplicar desconto sugerido"
                            >
                              <TrendingUp className="h-2.5 w-2.5" />
                              sugerido: {fmt(auto)}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-4 border-l border-white/5 bg-emerald-500/5 text-center">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm font-bold text-foreground/90">
                          {partnerPrices[p.credits_amount] > 0
                            ? fmt(partnerPrices[p.credits_amount])
                            : "—"}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-mono">
                          somente leitura
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
