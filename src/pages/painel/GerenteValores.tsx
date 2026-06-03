import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, RefreshCcw, Tag, Sparkles, Trash2, Save, Crown, Info, ChevronDown, ChevronUp, Package, TrendingUp, Layers, DollarSign, Percent, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  license_type: string;
  label: string;
  cost_cents: number;
  price_cents: number;
  customer_price_cents: number;
  min_price_cents: number;
  pricing_mode: "fixed" | "markup";
  markup_percent: number;
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
  tier_id: string;
  license_type: string;
  price_cents: number;
};

type ProviderRow = {
  type: string;
  label?: string;
  name?: string;
  price?: number;
  price_cents?: number;
  cost?: number;
  cost_cents?: number;
  retail_cents?: number;
};

const FALLBACK_LABEL: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
};

const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseBRL = (s: string) => Math.round(parseFloat((s || "0").replace(/\./g, "").replace(",", ".")) * 100) || 0;

function normalizeProviderResponse(data: any): ProviderRow[] {
  if (!data) return [];
  let source: any = data;
  if (data.pricing && typeof data.pricing === "object" && !Array.isArray(data.pricing)) {
    source = data.pricing;
  } else if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    source = data.data;
  }

  if (Array.isArray(source)) {
    return source
      .filter((r: any) => r && (r.type || r.license_type))
      .map((r: any) => ({
        type: r.type ?? r.license_type,
        label: r.label ?? r.name,
        // final_price_cents = custo com desconto (20% off)
        cost_cents: r.final_price_cents ?? r.your_price_centavos ?? r.cost_cents ?? (r.cost ? Math.round(r.cost * 100) : undefined),
        // base_price_cents = preço de venda configurado no provedor
        retail_cents: r.base_price_cents ?? r.retail_centavos ?? r.price_cents ?? (r.price ? Math.round(r.price * 100) : undefined),
      }));
  }

  if (typeof source === "object") {
    return Object.entries(source)
      .filter(([k, v]) => k && v && typeof v === "object")
      .map(([k, v]: any) => ({
        type: k,
        label: v.label ?? v.name,
        // final_price_cents = custo com desconto (20% off)
        cost_cents: v.final_price_cents ?? v.your_price_centavos ?? v.cost_cents ?? (typeof v.cost === "number" ? Math.round(v.cost * 100) : undefined),
        // base_price_cents = preço de venda configurado no provedor
        retail_cents: v.base_price_cents ?? v.retail_centavos ?? v.price_cents ?? (typeof v.price === "number" ? Math.round(v.price * 100) : undefined),
      }))
      .filter((r) => r.type && (r.cost_cents != null || r.retail_cents != null));
  }
  return [];
}

export default function GerenteValores() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierPrices, setTierPrices] = useState<TierPrice[]>([]);
  const [mainExtId, setMainExtId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerRows, setProviderRows] = useState<ProviderRow[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileExpandedRow, setMobileExpandedRow] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { mode: "fixed" | "markup"; price: string; customer_price: string; markup: string; selected: boolean }>>({});

  const loadAll = async () => {
    setLoading(true);
    const [
      { data: pData },
      { data: tData },
      { data: exData }
    ] = await Promise.all([
      supabase.rpc("gerente_list_pricing_plans"),
      supabase.from("reseller_tiers").select("*").order("sort_order"),
      supabase.from("extensions").select("id").eq("is_active", true).limit(1)
    ]);

    const order = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
    const sortedPlans = ((pData ?? []) as Plan[])
      .filter(p => order.includes(p.license_type))
      .sort((a, b) => order.indexOf(a.license_type) - order.indexOf(b.license_type));

    const extId = exData?.[0]?.id || null;
    setMainExtId(extId);
    setPlans(sortedPlans);
    setTiers(((tData ?? []) as Tier[]).filter(t => t.slug !== "partner"));

    if (extId) {
      const { data: tpData } = await supabase
        .from("tier_extension_prices")
        .select("tier_id, license_type, price_cents")
        .eq("extension_id", extId);
      setTierPrices((tpData ?? []) as TierPrice[]);
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const fetchProvider = async () => {
    setProviderLoading(true);
    setProviderError(null);
    try {
      const { data, error } = await supabase.functions.invoke("provider-api?action=pricing", { method: "GET" });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const rows = normalizeProviderResponse(data);
      setProviderRows(rows);
      // Pre-fill drafts
      const next: typeof drafts = {};
      for (const r of rows) {
        const cost = r.cost_cents ?? Math.round((r.cost ?? 0) * 100);
        const retail = r.retail_cents ?? cost;
        const existing = plans.find((p) => p.license_type === r.type);
        next[r.type] = {
          mode: existing?.pricing_mode ?? "fixed",
          price: existing ? (existing.price_cents / 100).toFixed(2).replace(".", ",") : (retail / 100).toFixed(2).replace(".", ","),
          customer_price: existing ? (existing.customer_price_cents / 100).toFixed(2).replace(".", ",") : (retail / 100).toFixed(2).replace(".", ","),
          markup: existing ? String(existing.markup_percent) : "30",
          selected: !existing,
        };
      }
      setDrafts(next);
    } catch (e: any) {
      setProviderError(e?.message ?? "Falha ao buscar provedor");
    } finally {
      setProviderLoading(false);
    }
  };

  const openCreate = async () => {
    setCreateOpen(true);
    if (providerRows.length === 0) await fetchProvider();
  };

  const computePrice = (costCents: number, d: { mode: "fixed" | "markup"; price: string; markup: string }) => {
    if (d.mode === "fixed") return parseBRL(d.price);
    const pct = Number((d.markup || "0").replace(",", ".")) || 0;
    return Math.round(costCents * (1 + pct / 100));
  };

  const saveAll = async () => {
    const rows = providerRows.filter((r) => drafts[r.type]?.selected);
    if (!rows.length) return toast.error("Selecione ao menos um plano");

    const payload = rows.map((r) => {
      const cost = r.cost_cents ?? Math.round((r.cost ?? 0) * 100);
      const d = drafts[r.type];
      return {
        license_type: r.type,
        label: r.label ?? r.name ?? FALLBACK_LABEL[r.type] ?? r.type,
        cost_cents: cost,
        price_cents: computePrice(cost, d),
        customer_price_cents: parseBRL(d.customer_price),
        pricing_mode: d.mode,
        markup_percent: d.mode === "markup" ? Number((d.markup || "0").replace(",", ".")) : 0,
        is_active: true,
      };
    });

    const { error } = await supabase.from("pricing_plans").upsert(payload, { onConflict: "license_type" });
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} plano(s) salvo(s)`);
    setCreateOpen(false);
    loadAll();
  };

  const updatePlan = async (p: Plan, patch: Partial<Plan>) => {
    const { error } = await supabase.from("pricing_plans").update(patch).eq("id", p.id);
    if (error) return toast.error(error.message);
    setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, ...patch } : x));
  };

  const deletePlan = async (p: Plan) => {
    if (!confirm(`Remover plano "${p.label}"?`)) return;
    const { error } = await supabase.from("pricing_plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    setPlans((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("Plano removido");
  };

  const saveTierPrice = async (tierId: string, licenseType: string, cents: number | null) => {
    if (!mainExtId) return toast.error("Nenhuma extensão ativa encontrada");
    
    if (cents === null) {
      // Remover override
      const { error } = await supabase
        .from("tier_extension_prices")
        .delete()
        .eq("tier_id", tierId)
        .eq("extension_id", mainExtId)
        .eq("license_type", licenseType);
      
      if (error) return toast.error(error.message);
      setTierPrices(prev => prev.filter(x => !(x.tier_id === tierId && x.license_type === licenseType)));
      toast.success("Override removido");
    } else {
      // Salvar override
      const { error } = await supabase
        .from("tier_extension_prices")
        .upsert({
          tier_id: tierId,
          extension_id: mainExtId,
          license_type: licenseType,
          price_cents: cents,
          is_active: true
        }, { onConflict: "tier_id,extension_id,license_type" });
      
      if (error) return toast.error(error.message);
      setTierPrices(prev => {
        const other = prev.filter(x => !(x.tier_id === tierId && x.license_type === licenseType));
        return [...other, { tier_id: tierId, license_type: licenseType, price_cents: cents }];
      });
      toast.success("Preço do nível atualizado");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            Valores <span className="text-primary italic">Extensões</span>
          </h1>
        }
        description="Configure custos, margens e preços personalizados por nível de revendedor."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="h-9 px-4 border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all hover:scale-105 active:scale-95">
              <RefreshCcw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
              Recarregar
            </Button>
          </div>
        }
      />

      {/* Cards de Métricas */}
      {!loading && plans.length > 0 && (() => {
        const totalCost = plans.reduce((s, p) => s + p.cost_cents, 0);
        const totalPrice = plans.reduce((s, p) => s + p.price_cents, 0);
        const totalCustomer = plans.reduce((s, p) => s + (p.customer_price_cents || 0), 0);
        const avgMarginPct = totalCost > 0 ? ((totalPrice - totalCost) / totalCost) * 100 : 0;
        const avgCustomerMarkupPct = totalPrice > 0 ? ((totalCustomer - totalPrice) / totalPrice) * 100 : 0;
        const cheapest = [...plans].sort((a, b) => a.price_cents - b.price_cents)[0];
        const priciest = [...plans].sort((a, b) => b.price_cents - a.price_cents)[0];
        const overridesCount = tierPrices.length;

        const cards = [
          {
            label: "Planos Ativos",
            value: String(plans.length),
            sub: `${plans.filter(p => p.is_active).length} habilitados`,
            icon: Package,
            color: "text-primary",
            bg: "from-primary/20 to-primary/5",
            ring: "ring-primary/20",
          },
          {
            label: "Custo Médio",
            value: fmt(Math.round(totalCost / plans.length)),
            sub: `Total: ${fmt(totalCost)}`,
            icon: DollarSign,
            color: "text-amber-400",
            bg: "from-amber-500/20 to-amber-500/5",
            ring: "ring-amber-500/20",
          },
          {
            label: "Margem Média",
            value: `${avgMarginPct.toFixed(1)}%`,
            sub: `Lucro: ${fmt(totalPrice - totalCost)}`,
            icon: TrendingUp,
            color: avgMarginPct >= 0 ? "text-emerald-400" : "text-destructive",
            bg: avgMarginPct >= 0 ? "from-emerald-500/20 to-emerald-500/5" : "from-destructive/20 to-destructive/5",
            ring: avgMarginPct >= 0 ? "ring-emerald-500/20" : "ring-destructive/20",
          },
          {
            label: "Markup Cliente",
            value: `${avgCustomerMarkupPct.toFixed(1)}%`,
            sub: `Loja: ${fmt(totalCustomer)}`,
            icon: Percent,
            color: "text-fuchsia-400",
            bg: "from-fuchsia-500/20 to-fuchsia-500/5",
            ring: "ring-fuchsia-500/20",
          },
          {
            label: "Mais Barato",
            value: cheapest ? fmt(cheapest.price_cents) : "—",
            sub: cheapest?.label ?? "—",
            icon: Tag,
            color: "text-sky-400",
            bg: "from-sky-500/20 to-sky-500/5",
            ring: "ring-sky-500/20",
          },
          {
            label: "Mais Caro",
            value: priciest ? fmt(priciest.price_cents) : "—",
            sub: priciest?.label ?? "—",
            icon: Crown,
            color: "text-yellow-400",
            bg: "from-yellow-500/20 to-yellow-500/5",
            ring: "ring-yellow-500/20",
          },
          {
            label: "Níveis Configurados",
            value: String(tiers.length),
            sub: `${overridesCount} override(s) ativos`,
            icon: Layers,
            color: "text-indigo-400",
            bg: "from-indigo-500/20 to-indigo-500/5",
            ring: "ring-indigo-500/20",
          },
        ];

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {cards.map((c) => (
              <div
                key={c.label}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-4 transition-all hover:scale-[1.02] hover:ring-2",
                  c.ring
                )}
              >
                <div className={cn("absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl bg-gradient-to-br opacity-60 group-hover:opacity-100 transition-opacity", c.bg)} />
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 leading-none">
                      {c.label}
                    </span>
                    <c.icon className={cn("h-3.5 w-3.5", c.color)} />
                  </div>
                  <div className={cn("font-display text-xl font-black tracking-tighter tabular-nums", c.color)}>
                    {c.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 font-medium truncate">
                    {c.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex items-center gap-2 rounded-2xl bg-primary/5 border border-primary/20 p-4 text-[11px] text-primary/80 font-medium leading-relaxed">
        <Info className="h-4 w-4 shrink-0" />
        Preços em itálico são calculados automaticamente com base no desconto do nível. Clique neles para definir um valor fixo.
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-card/20 p-20 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 flex h-16 w-12 items-center justify-center rounded-2xl bg-white/5">
            <Tag className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h3 className="font-display text-lg font-bold">Nenhum plano configurado</h3>
          <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted-foreground">
            Sincronize com o provedor para importar os planos disponíveis.
          </p>
          <Button onClick={openCreate} className="mt-6">
            Importar Agora
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden lg:block relative rounded-3xl border border-white/5 bg-card/20 backdrop-blur-md overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                    <th className="px-6 py-5 font-bold">Plano / Licença</th>
                    <th className="px-6 py-5 font-bold border-l border-white/5 bg-primary/5 text-right">Preço Base (LP)</th>
                    {tiers.map((t) => (
                      <th key={t.id} className="px-6 py-5 text-center font-bold min-w-[140px] border-l border-white/5">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-2">
                            <Crown className="h-3.5 w-3.5" style={{ color: t.color }} />
                            <span className="text-foreground tracking-tighter">{t.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-[9px] h-4 font-black bg-white/5 border-white/5">
                            {t.slug === "partner" ? "FIXO" : `-${t.discount_percent}%`}
                          </Badge>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {plans.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-base text-foreground/90">{p.label}</span>
                          <span className="font-mono text-[10px] uppercase text-muted-foreground/50 tracking-widest flex items-center gap-1.5">
                            <Tag className="h-3 w-3" /> {p.license_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right border-l border-white/5 bg-primary/5">
                        <PriceCell 
                          plan={p} 
                          onSave={(cents, mode, markup) => updatePlan(p, { price_cents: cents, pricing_mode: mode, markup_percent: markup })} 
                        />
                      </td>
                      {tiers.map((t) => {
                        const override = tierPrices.find(tp => tp.tier_id === t.id && tp.license_type === p.license_type);
                        const isPartner = t.slug === "partner";
                        const autoPrice = isPartner ? 0 : Math.round(p.price_cents * (1 - (t.discount_percent || 0) / 100));
                        const currentPrice = override ? override.price_cents : autoPrice;
                        
                        return (
                          <td key={t.id} className="px-6 py-5 text-center border-l border-white/5">
                            <TierPriceCell
                              currentPrice={currentPrice}
                              isOverride={!!override || isPartner}
                              onSave={(val) => saveTierPrice(t.id, p.license_type, val)}
                            />
                            <div className={cn(
                              "mt-1.5 text-[10px] font-black font-mono",
                              currentPrice > p.cost_cents ? "text-emerald-500/50" : "text-destructive/50"
                            )}>
                              {currentPrice > p.cost_cents ? "+" : ""}{fmt(currentPrice - p.cost_cents)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <div className="lg:hidden grid gap-4">
            {plans.map((p) => {
              const isExpanded = mobileExpandedRow === p.id;
              return (
                <div key={p.id} className="rounded-3xl border border-white/5 bg-card/20 backdrop-blur-md p-6 space-y-4 relative overflow-hidden group">
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-all" />
                  
                  <div 
                    className="flex items-start justify-between relative z-10 cursor-pointer"
                    onClick={() => setMobileExpandedRow(isExpanded ? null : p.id)}
                  >
                    <div className="space-y-1">
                      <h3 className="font-display text-xl font-black tracking-tight">{p.label}</h3>
                      <code className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded border border-white/5">{p.license_type}</code>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/5">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-primary/5 rounded-2xl border border-primary/10 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary/60">Preço Base (LP)</span>
                          <PriceCell 
                            plan={p} 
                            onSave={(cents, mode, markup) => updatePlan(p, { price_cents: cents, pricing_mode: mode, markup_percent: markup })} 
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-emerald-500/50">
                          <span>Margem Base</span>
                          <span>{fmt(p.price_cents - p.cost_cents)}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 border-b border-white/5 pb-2">Preços por Nível</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {tiers.map((t) => {
                            const override = tierPrices.find(tp => tp.tier_id === t.id && tp.license_type === p.license_type);
                            const isPartner = t.slug === "partner";
                            const autoPrice = isPartner ? 0 : Math.round(p.price_cents * (1 - (t.discount_percent || 0) / 100));
                            const currentPrice = override ? override.price_cents : autoPrice;
                            
                            return (
                              <div key={t.id} className="flex items-center justify-between bg-white/5 rounded-xl border border-white/5 p-3">
                                <div className="flex items-center gap-2">
                                  <Crown className="h-3 w-3" style={{ color: t.color }} />
                                  <span className="text-[11px] font-bold tracking-tight text-foreground/80">{t.name}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <TierPriceCell
                                    currentPrice={currentPrice}
                                    isOverride={!!override || isPartner}
                                    onSave={(val) => saveTierPrice(t.id, p.license_type, val)}
                                  />
                                  <span className={cn(
                                    "text-[9px] font-mono",
                                    currentPrice > p.cost_cents ? "text-emerald-500/40" : "text-destructive/40"
                                  )}>
                                    M: {fmt(currentPrice - p.cost_cents)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Import Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sincronizar com Provedor
            </DialogTitle>
            <DialogDescription>
              Selecione os planos disponíveis na API do fornecedor e defina sua margem de lucro inicial.
            </DialogDescription>
          </DialogHeader>

          {providerLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : providerError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm text-destructive mb-4">{providerError}</p>
              <Button variant="outline" size="sm" onClick={fetchProvider}>Tentar novamente</Button>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-3 overflow-auto pr-2 custom-scrollbar">
              {providerRows.map((r) => {
                const cost = r.cost_cents ?? Math.round((r.cost ?? 0) * 100);
                const d = drafts[r.type];
                if (!d) return null;
                const finalPrice = computePrice(cost, d);
                return (
                  <div key={r.type} className={cn(
                    "rounded-xl border p-4 transition-all duration-200",
                    d.selected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-background/50 opacity-60"
                  )}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={d.selected}
                        onChange={(e) => setDrafts({ ...drafts, [r.type]: { ...d, selected: e.target.checked } })}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-sm text-foreground">{r.label ?? r.name ?? FALLBACK_LABEL[r.type] ?? r.type}</div>
                        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-tight">
                          Ref: {r.type} · Custo: {fmt(cost)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-black text-primary">{fmt(finalPrice)}</div>
                        <div className="text-[9px] text-muted-foreground">Preço Sugerido</div>
                      </div>
                    </div>

                    {d.selected && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 bg-secondary/30 p-3 rounded-lg border border-border/50">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] uppercase font-bold tracking-widest opacity-70">Modo de Precificação</Label>
                          <div className="flex h-8 rounded-md border border-border overflow-hidden bg-background">
                            <button
                              onClick={() => setDrafts({ ...drafts, [r.type]: { ...d, mode: "fixed" } })}
                              className={cn("flex-1 text-[10px] font-bold uppercase transition-colors", d.mode === "fixed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
                            >Fixo R$</button>
                            <button
                              onClick={() => setDrafts({ ...drafts, [r.type]: { ...d, mode: "markup" } })}
                              className={cn("flex-1 text-[10px] font-bold uppercase transition-colors", d.mode === "markup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
                            >Markup %</button>
                          </div>
                        </div>
                        <div className="sm:col-span-2 space-y-1">
                          <Label className="text-[9px] uppercase font-bold tracking-widest opacity-70">
                            {d.mode === "fixed" ? "Preço LP (R$)" : "Acréscimo % (LP)"}
                          </Label>
                          <Input
                            value={d.mode === "fixed" ? d.price : d.markup}
                            onChange={(e) => setDrafts({ ...drafts, [r.type]: { ...d, [d.mode === "fixed" ? "price" : "markup"]: e.target.value } })}
                            placeholder="0,00"
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={saveAll} className="bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Save className="mr-2 h-4 w-4" /> Finalizar Importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PriceCell({ plan, onSave }: { plan: Plan; onSave: (cents: number, mode: "fixed" | "markup", markup: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"fixed" | "markup">(plan.pricing_mode);
  const [price, setPrice] = useState((plan.price_cents / 100).toFixed(2).replace(".", ","));
  const [markup, setMarkup] = useState(String(plan.markup_percent));

  if (!editing) {
    return (
      <button 
        onClick={() => setEditing(true)} 
        className="group relative font-mono font-black text-sm text-primary hover:scale-105 transition-all inline-flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 hover:bg-primary/20 shadow-glow-sm"
      >
        {fmt(plan.price_cents)}
        <Save className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }
  
  const submit = () => {
    const cents = mode === "fixed"
      ? parseBRL(price)
      : Math.round(plan.cost_cents * (1 + (Number(markup.replace(",", ".")) || 0) / 100));
    onSave(cents, mode, mode === "markup" ? Number(markup.replace(",", ".")) : 0);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-end gap-1.5 animate-in zoom-in-95 duration-200">
      <div className="flex bg-white/5 rounded-lg border border-white/10 p-0.5">
        <button
          onClick={() => setMode("fixed")}
          className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors", mode === "fixed" ? "bg-primary text-white" : "text-muted-foreground")}
        >R$</button>
        <button
          onClick={() => setMode("markup")}
          className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors", mode === "markup" ? "bg-primary text-white" : "text-muted-foreground")}
        >%</button>
      </div>
      <Input
        value={mode === "fixed" ? price : markup}
        onChange={(e) => mode === "fixed" ? setPrice(e.target.value) : setMarkup(e.target.value)}
        className="h-8 w-20 text-right font-mono text-xs focus-visible:ring-primary bg-white/5 border-white/10"
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button size="icon" variant="default" className="h-8 w-8 rounded-lg shadow-glow-sm" onClick={submit}>
        <Save className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function TierPriceCell({ currentPrice, isOverride, onSave }: { currentPrice: number; isOverride: boolean; onSave: (cents: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((currentPrice / 100).toFixed(2).replace(".", ","));

  if (!editing) {
    return (
      <button 
        onClick={() => setEditing(true)} 
        className={cn(
          "font-mono text-xs transition-all hover:text-primary hover:scale-105 px-2 py-1 rounded-lg border",
          isOverride 
            ? "font-black text-foreground border-primary/40 bg-primary/10 shadow-glow-sm" 
            : "italic text-muted-foreground/40 border-transparent hover:border-white/10"
        )}
      >
        {fmt(currentPrice)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 animate-in zoom-in-95 duration-200 bg-black/60 p-2 rounded-xl border border-white/10 shadow-2xl relative z-50">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 w-24 text-center font-mono text-xs focus-visible:ring-primary bg-white/5 border-white/10"
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && onSave(parseBRL(val))}
      />
      <div className="flex gap-1">
        <Button 
          size="sm" 
          variant="default" 
          className="h-7 px-3 text-[10px] font-bold uppercase rounded-lg shadow-glow-sm" 
          onClick={() => { onSave(parseBRL(val)); setEditing(false); }}
        >
          Ok
        </Button>
        {isOverride && (
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 px-2 text-[10px] font-bold uppercase text-destructive hover:bg-destructive/10 rounded-lg" 
            onClick={() => { onSave(null); setEditing(false); }}
          >
            Reset
          </Button>
        )}
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-7 px-2 text-[10px] font-bold uppercase text-muted-foreground hover:bg-white/5 rounded-lg" 
          onClick={() => setEditing(false)}
        >
          X
        </Button>
      </div>
    </div>
  );
}
