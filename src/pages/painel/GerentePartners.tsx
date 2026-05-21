import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Save, Crown, Users, Tag, Search, Sparkles, RotateCcw, CheckCircle2, Pencil, Coins,
} from "lucide-react";
import { toast } from "sonner";

type Tier = {
  id: string;
  slug: string;
  name: string;
  color: string;
  is_active: boolean;
  is_hidden: boolean;
  min_spent_cents: number;
  sort_order: number;
};
type Extension = { id: string; name: string };
type Reseller = { id: string; display_name: string };
type State = { reseller_id: string; forced_tier_id: string | null; total_spent_cents: number };
type CreditPackage = { credits_amount: number; label: string };

const LICENSE_TYPES: { key: string; label: string; short: string }[] = [
  { key: "pro_1d", label: "Pro 1 dia", short: "1d" },
  { key: "pro_7d", label: "Pro 7 dias", short: "7d" },
  { key: "pro_15d", label: "Pro 15 dias", short: "15d" },
  { key: "pro_30d", label: "Pro 30 dias", short: "30d" },
  { key: "lifetime", label: "Vitalícia", short: "∞" },
];

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function GerentePartners() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [selectedResellerId, setSelectedResellerId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Preço efetivo atual (override → reseller_extension_prices → plano global)
  // Sempre preenchido — o que o gerente NÃO mexer continua nesse valor.
  const [effective, setEffective] = useState<Record<string, number>>({});
  // Valor exibido/editado pelo gerente
  const [draft, setDraft] = useState<Record<string, number>>({});
  // Origem do preço por célula: "override" | "reseller" | "plan" | "none"
  const [source, setSource] = useState<Record<string, "override" | "reseller" | "plan" | "none">>({});

  // Recargas: chave = credits_amount (number como string)
  const [creditEffective, setCreditEffective] = useState<Record<number, number>>({});
  const [creditDraft, setCreditDraft] = useState<Record<number, number>>({});
  const [creditSource, setCreditSource] = useState<Record<number, "reseller" | "ouro" | "none">>({});

  // Preços de créditos do nível Ouro (fallback para Partners sem preço definido)
  const [ouroCreditPrices, setOuroCreditPrices] = useState<Record<number, number>>({});

  // Custo base (preços globais). Valores em centavos.
  const [creditBase, setCreditBase] = useState<Record<number, number>>({}); // credits_amount -> cents

  const minCredit = (amount: number) => creditBase[amount] ?? 0;

  const partnerTiers = useMemo(
    () => tiers.filter((t) => t.is_active && (t.is_hidden || t.slug === "partner")),
    [tiers],
  );
  const selectedTier = useMemo(() => tiers.find((t) => t.id === selectedTierId) ?? null, [tiers, selectedTierId]);
  const selectedReseller = useMemo(
    () => resellers.find((r) => r.id === selectedResellerId) ?? null,
    [resellers, selectedResellerId],
  );

  const partnersOfTier = useMemo(
    () => {
      if (!selectedTierId) return [];
      const activeTiers = [...tiers]
        .filter((t) => t.is_active)
        .sort((a, b) => a.min_spent_cents - b.min_spent_cents);
      const naturalTierId = (spent: number) => {
        let match = activeTiers[0]?.id ?? null;
        for (const t of activeTiers) {
          if (t.min_spent_cents <= spent) match = t.id;
        }
        return match;
      };
      const matched: Reseller[] = [];
      for (const r of resellers) {
        const st = states[r.id];
        const forced = st?.forced_tier_id ?? null;
        const effectiveTierId = forced ?? naturalTierId(st?.total_spent_cents ?? 0);
        if (effectiveTierId === selectedTierId) matched.push(r);
      }
      return matched;
    },
    [states, resellers, selectedTierId, tiers],
  );

  const filteredPartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partnersOfTier;
    return partnersOfTier.filter((p) => p.display_name.toLowerCase().includes(q));
  }, [partnersOfTier, search]);

  // Quantos campos foram modificados em relação ao efetivo
  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(draft)) {
      if ((draft[k] ?? 0) !== (effective[k] ?? 0)) n++;
    }
    for (const k of Object.keys(creditDraft)) {
      if ((creditDraft[Number(k)] ?? 0) !== (creditEffective[Number(k)] ?? 0)) n++;
    }
    return n;
  }, [draft, effective, creditDraft, creditEffective]);

  const customCount = useMemo(
    () =>
      Object.values(source).filter((s) => s === "override").length +
      Object.values(creditSource).filter((s) => s === "reseller").length,
    [source, creditSource],
  );

  const loadBase = async () => {
    setLoading(true);
    const [{ data: t }, { data: ex }, { data: r }, { data: s }, { data: cp }] = await Promise.all([
      supabase.from("reseller_tiers").select("id,slug,name,color,is_active,is_hidden,min_spent_cents,sort_order").order("sort_order"),
      supabase.from("extensions").select("id,name").eq("is_active", true).order("name"),
      supabase.from("resellers").select("id,display_name").order("display_name"),
      supabase.from("reseller_tier_state").select("reseller_id,forced_tier_id,total_spent_cents"),
      supabase.from("credit_pricing_plans").select("credits_amount,label,price_cents,is_active").eq("is_active", true).order("credits_amount"),
    ]);
    const tierList = (t ?? []) as Tier[];
    setTiers(tierList);
    setExtensions((ex ?? []) as Extension[]);
    setResellers((r ?? []) as Reseller[]);
    setCreditPackages(((cp ?? []) as any[]).map((p) => ({ credits_amount: p.credits_amount, label: p.label })));

    // base costs (apenas recargas)
    const cb: Record<number, number> = {};
    (cp ?? []).forEach((p: any) => {
      if (p.is_active && p.price_cents > 0) cb[p.credits_amount] = p.price_cents;
    });
    setCreditBase(cb);

    // Preços de crédito do nível Ouro (fallback)
    const ouroTier = tierList.find((x) => x.slug === "ouro");
    if (ouroTier) {
      const { data: ouroTcp } = await supabase
        .from("tier_credit_prices")
        .select("plan_id,price_cents,is_active,credit_pricing_plans!inner(credits_amount)")
        .eq("tier_id", ouroTier.id)
        .eq("is_active", true);
      const ouroMap: Record<number, number> = {};
      (ouroTcp ?? []).forEach((row: any) => {
        const amount = row.credit_pricing_plans?.credits_amount;
        if (amount != null && row.price_cents > 0) ouroMap[amount] = row.price_cents;
      });
      setOuroCreditPrices(ouroMap);
    }

    const stateMap: Record<string, State> = {};
    (s ?? []).forEach((row: any) => { stateMap[row.reseller_id] = row; });
    setStates(stateMap);

    const firstHidden = tierList.find((x) => x.is_hidden && x.is_active);
    if (firstHidden) setSelectedTierId((cur) => cur || firstHidden.id);
    setLoading(false);
  };

  // Carrega preço efetivo + origem para cada célula da matriz
  const loadEffectivePrices = async (resellerId: string) => {
    setLoadingPrices(true);
    const [{ data: ovs }, { data: resPrices }, { data: plans }, { data: creditRes }] = await Promise.all([
      supabase
        .from("reseller_extension_price_overrides")
        .select("extension_id,license_type,price_cents,is_active")
        .eq("reseller_id", resellerId),
      supabase
        .from("reseller_extension_prices")
        .select("extension_id,license_type,price_cents,is_active")
        .eq("reseller_id", resellerId),
      supabase
        .from("pricing_plans")
        .select("license_type,price_cents,is_active"),
      supabase
        .from("reseller_credit_prices")
        .select("credits_amount,price_cents,is_active")
        .eq("reseller_id", resellerId),
    ]);

    const eff: Record<string, number> = {};
    const src: Record<string, "override" | "reseller" | "plan" | "none"> = {};

    const planByType = new Map<string, number>();
    (plans ?? []).forEach((p: any) => {
      if (p.is_active && p.price_cents > 0) planByType.set(p.license_type, p.price_cents);
    });

    const resByKey = new Map<string, number>();
    (resPrices ?? []).forEach((rp: any) => {
      if (rp.is_active && rp.price_cents > 0) {
        resByKey.set(`${rp.extension_id}|${rp.license_type}`, rp.price_cents);
      }
    });

    const ovByKey = new Map<string, number>();
    (ovs ?? []).forEach((o: any) => {
      if (o.is_active && o.price_cents >= 0) {
        ovByKey.set(`${o.extension_id}|${o.license_type}`, o.price_cents);
      }
    });

    for (const ext of extensions) {
      for (const lt of LICENSE_TYPES) {
        const k = `${ext.id}|${lt.key}`;
        if (ovByKey.has(k)) {
          eff[k] = ovByKey.get(k)!;
          src[k] = "override";
        } else if (resByKey.has(k)) {
          eff[k] = resByKey.get(k)!;
          src[k] = "reseller";
        } else if (planByType.has(lt.key)) {
          eff[k] = planByType.get(lt.key)!;
          src[k] = "plan";
        } else {
          eff[k] = 0;
          src[k] = "none";
        }
      }
    }

    // Recargas
    const creditByAmount = new Map<number, number>();
    (creditRes ?? []).forEach((rp: any) => {
      if (rp.is_active && rp.price_cents > 0) {
        creditByAmount.set(rp.credits_amount, rp.price_cents);
      }
    });
    const isPartnerTier = selectedTier?.slug === "partner";
    const cEff: Record<number, number> = {};
    const cSrc: Record<number, "reseller" | "ouro" | "none"> = {};
    for (const pkg of creditPackages) {
      if (creditByAmount.has(pkg.credits_amount)) {
        cEff[pkg.credits_amount] = creditByAmount.get(pkg.credits_amount)!;
        cSrc[pkg.credits_amount] = "reseller";
      } else if (isPartnerTier && ouroCreditPrices[pkg.credits_amount] != null) {
        cEff[pkg.credits_amount] = ouroCreditPrices[pkg.credits_amount];
        cSrc[pkg.credits_amount] = "ouro";
      } else {
        cEff[pkg.credits_amount] = 0;
        cSrc[pkg.credits_amount] = "none";
      }
    }

    setEffective(eff);
    setSource(src);
    setDraft({ ...eff });
    setCreditEffective(cEff);
    setCreditSource(cSrc);
    setCreditDraft({ ...cEff });
    setLoadingPrices(false);
  };

  useEffect(() => { loadBase(); }, []);

  useEffect(() => {
    setSelectedResellerId("");
    setEffective({}); setDraft({}); setSource({});
    setCreditEffective({}); setCreditDraft({}); setCreditSource({});
  }, [selectedTierId]);

  useEffect(() => {
    if (selectedResellerId && extensions.length) loadEffectivePrices(selectedResellerId);
    else {
      setEffective({}); setDraft({}); setSource({});
      setCreditEffective({}); setCreditDraft({}); setCreditSource({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResellerId, extensions.length, creditPackages.length]);

  const save = async () => {
    if (!selectedResellerId) return;

    // Validação: apenas recargas não podem ficar abaixo do custo base
    for (const pkg of creditPackages) {
      const v = Number(creditDraft[pkg.credits_amount] ?? 0);
      const base = minCredit(pkg.credits_amount);
      if (v > 0 && base > 0 && v <= base) {
        toast.error(`${pkg.credits_amount} recargas: valor precisa ser maior que o custo base ${formatBRL(base)}`);
        return;
      }
    }

    setSaving(true);

    // === EXTENSÕES (overrides) ===
    const rows = extensions.flatMap((ext) =>
      LICENSE_TYPES.map((lt) => {
        const k = `${ext.id}|${lt.key}`;
        const v = Number(draft[k] ?? 0);
        const wasOverride = source[k] === "override";
        const changed = v !== Number(effective[k] ?? 0);
        if ((changed || wasOverride) && v > 0) {
          return {
            reseller_id: selectedResellerId,
            extension_id: ext.id,
            license_type: lt.key,
            price_cents: Math.round(v),
            is_active: true,
          };
        }
        return null;
      }),
    ).filter(Boolean) as any[];

    const { error: delErr } = await supabase
      .from("reseller_extension_price_overrides")
      .delete()
      .eq("reseller_id", selectedResellerId);
    if (delErr) {
      toast.error(delErr.message);
      setSaving(false);
      return;
    }
    if (rows.length) {
      const { error } = await supabase.from("reseller_extension_price_overrides").insert(rows);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    // === CRÉDITOS (reseller_credit_prices) ===
    const creditRows = creditPackages
      .map((pkg) => {
        const v = Number(creditDraft[pkg.credits_amount] ?? 0);
        if (v > 0) {
          return {
            reseller_id: selectedResellerId,
            credits_amount: pkg.credits_amount,
            price_cents: Math.round(v),
            is_active: true,
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    const { error: delCredErr } = await supabase
      .from("reseller_credit_prices")
      .delete()
      .eq("reseller_id", selectedResellerId);
    if (delCredErr) {
      toast.error(delCredErr.message);
      setSaving(false);
      return;
    }
    if (creditRows.length) {
      const { error } = await supabase.from("reseller_credit_prices").insert(creditRows);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(`Preços salvos para ${selectedReseller?.display_name}`);
    await loadEffectivePrices(selectedResellerId);
    setSaving(false);
  };

  const resetDraft = () => {
    setDraft({ ...effective });
    setCreditDraft({ ...creditEffective });
  };

  if (loading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Partners"
        description="Defina preços manuais por extensão para cada revendedor parceiro individualmente."
      />

      {partnerTiers.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          Nenhum nível de parceiro encontrado. Crie um nível marcando a opção "Oculto para revendedores" em{" "}
          <Link to="/painel/gerente/niveis" className="text-primary underline">Níveis</Link>.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Card: seleção de nível parceiro */}
          <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <div>
                <h3 className="font-display text-lg font-bold tracking-tight flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Nível parceiro
                </h3>
                <p className="text-[11px] text-muted-foreground">Selecione o nível oculto para gerenciar seus parceiros.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px] max-w-md">
                <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                  <SelectTrigger className="h-11 bg-card border-border">
                    <SelectValue placeholder="Selecione um nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerTiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTier && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ background: `${selectedTier.color}22`, color: selectedTier.color }}
                  >
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-bold tabular-nums">{partnersOfTier.length}</div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                      parceiro{partnersOfTier.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedTier && (
            <div className="space-y-6">
              {/* Card: Parceiros (busca + lista horizontal de chips) */}
              <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3">
                  <div className="h-6 w-1 bg-primary rounded-full" />
                  <h3 className="font-display text-sm font-bold tracking-tight flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Parceiros
                  </h3>
                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] tabular-nums">
                    {filteredPartners.length}
                  </Badge>
                </div>

                <div className="p-4 sm:p-5 space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar parceiro..."
                      className="h-10 pl-9 text-sm"
                    />
                  </div>

                  {filteredPartners.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground italic">
                      {partnersOfTier.length === 0 ? (
                        <>
                          Nenhum revendedor neste nível. Promova alguém em{" "}
                          <Link to="/painel/gerente/niveis" className="text-primary underline">Níveis</Link>.
                        </>
                      ) : "Nenhum resultado."}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filteredPartners.map((p) => {
                        const active = p.id === selectedResellerId;
                        const initials = p.display_name
                          .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelectedResellerId(p.id)}
                            className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
                              active
                                ? "border-primary/40 bg-primary/5 text-foreground shadow-sm"
                                : "border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground hover:shadow-sm"
                            }`}
                          >
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                              style={{
                                background: active ? selectedTier.color : `${selectedTier.color}22`,
                                color: active ? "#fff" : selectedTier.color,
                              }}
                            >
                              {initials || <Crown className="h-3 w-3" />}
                            </span>
                            <span className="font-medium">{p.display_name}</span>
                            {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Card: detalhes do parceiro selecionado (em baixo) */}
              <div className="space-y-4 min-w-0">
                {!selectedReseller ? (
                  <div className="flex h-60 items-center justify-center rounded-3xl border border-dashed border-border bg-card shadow-sm">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Crown className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-bold">Selecione um parceiro</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Clique em um parceiro acima para definir preços individuais.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Card: header do parceiro selecionado */}
                    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                      <div
                        className="h-1 w-full"
                        style={{ background: selectedTier.color }}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0"
                            style={{ background: `${selectedTier.color}22`, color: selectedTier.color }}
                          >
                            <Crown className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold leading-tight truncate">{selectedReseller.display_name}</div>
                            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                              style={{ background: `${selectedTier.color}1f`, color: selectedTier.color }}
                            >
                              <Crown className="h-3 w-3" /> {selectedTier.name}
                            </div>
                          </div>
                        </div>

                        {/* Stat chips + ações */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="hidden sm:inline-flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs">
                            <span className="text-muted-foreground">
                              <span className="font-mono font-bold text-foreground tabular-nums">{customCount}</span> personalizados
                            </span>
                            <span className="h-3 w-px bg-border" />
                            <span className={dirtyCount ? "text-amber-600 dark:text-amber-400 font-bold" : "text-muted-foreground"}>
                              <span className="font-mono tabular-nums">{dirtyCount}</span> alterados
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={resetDraft}
                            disabled={!dirtyCount || saving}
                            className="h-9"
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reverter
                          </Button>
                          <Button
                            onClick={save}
                            disabled={saving || loadingPrices}
                            className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                            Salvar
                          </Button>
                        </div>
                      </div>

                      {/* Legenda */}
                      <div className="border-t border-border bg-muted/20 px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                          Personalizado
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500/70" />
                          Por revendedor
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
                          Plano global
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <Pencil className="h-3 w-3" />
                          Não salvo
                        </span>
                      </div>
                    </div>

                    {/* Card: matriz de preços */}
                    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3">
                        <div className="h-6 w-1 bg-primary rounded-full" />
                        <h3 className="font-display text-sm font-bold tracking-tight flex items-center gap-2">
                          <Tag className="h-4 w-4 text-primary" /> Preços por extensão
                        </h3>
                      </div>
                      {loadingPrices ? (
                        <div className="flex h-40 items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : extensions.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground italic">
                          Nenhuma extensão ativa cadastrada.
                        </div>
                      ) : (
                        <div className="overflow-auto">
                          <table className="w-full table-fixed text-sm" style={{ minWidth: 760 }}>
                            <colgroup>
                              <col style={{ width: "30%" }} />
                              {LICENSE_TYPES.map((lt) => (
                                <col key={lt.key} style={{ width: `${70 / LICENSE_TYPES.length}%` }} />
                              ))}
                            </colgroup>
                            <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3 text-left font-bold">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Tag className="h-3 w-3" /> Extensão
                                  </span>
                                </th>
                                {LICENSE_TYPES.map((lt) => (
                                  <th key={lt.key} className="px-2 py-3 text-center font-bold">
                                    {lt.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {extensions.map((ext, idx) => (
                                <tr
                                  key={ext.id}
                                  className={`border-t border-border transition-colors hover:bg-muted/30 ${
                                    idx % 2 === 0 ? "" : "bg-muted/10"
                                  }`}
                                >
                                  <td className="px-4 py-2.5">
                                    <div className="font-bold text-foreground truncate">{ext.name}</div>
                                  </td>
                                  {LICENSE_TYPES.map((lt) => {
                                    const k = `${ext.id}|${lt.key}`;
                                    const cents = draft[k] ?? 0;
                                    const reais = cents > 0 ? (cents / 100).toFixed(2) : "";
                                    const src = source[k] ?? "none";
                                    const dirty = (draft[k] ?? 0) !== (effective[k] ?? 0);
                                    const dotColor =
                                      src === "override"
                                        ? "bg-primary"
                                        : src === "reseller"
                                        ? "bg-blue-500/70"
                                        : src === "plan"
                                        ? "bg-muted-foreground/50"
                                        : "bg-transparent";
                                    return (
                                      <td key={lt.key} className="px-2 py-1.5">
                                        <div className="relative mx-auto flex w-32 items-center">
                                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                            R$
                                          </span>
                                          <span
                                            className={`pointer-events-none absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${dotColor}`}
                                            title={
                                              src === "override"
                                                ? "Personalizado deste parceiro"
                                                : src === "reseller"
                                                ? "Preço por revendedor"
                                                : src === "plan"
                                                ? "Plano global"
                                                : "Sem preço"
                                            }
                                          />
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="—"
                                            value={reais}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              const c = v === "" ? 0 : Math.max(0, Math.round(parseFloat(v) * 100));
                                              setDraft((prev) => ({ ...prev, [k]: c }));
                                            }}
                                            className={`h-9 w-32 pl-7 text-right font-mono text-xs tabular-nums transition-all ${
                                              dirty
                                                ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20"
                                                : src === "override"
                                                ? "border-primary/30 bg-primary/5"
                                                : ""
                                            }`}
                                          />
                                          {dirty && (
                                            <Pencil className="pointer-events-none absolute -right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
                                          )}
                                        </div>
                                        {dirty && effective[k] > 0 && (
                                          <div className="mt-0.5 text-right text-[9px] font-mono text-muted-foreground">
                                            antes: {formatBRL(effective[k])}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Card: matriz de preços de recargas */}
                    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3">
                        <div className="h-6 w-1 bg-primary rounded-full" />
                        <h3 className="font-display text-sm font-bold tracking-tight flex items-center gap-2">
                          <Coins className="h-4 w-4 text-primary" /> Preços de recargas
                        </h3>
                      </div>
                      {loadingPrices ? (
                        <div className="flex h-32 items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : creditPackages.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground italic">
                          Nenhum pacote de recargas cadastrado.
                        </div>
                      ) : (
                        <div className="grid gap-2 p-3 sm:p-4 sm:grid-cols-2 lg:grid-cols-3">
                          {creditPackages.map((pkg) => {
                            const cents = creditDraft[pkg.credits_amount] ?? 0;
                            const reais = cents > 0 ? (cents / 100).toFixed(2) : "";
                            const src = creditSource[pkg.credits_amount] ?? "none";
                            const dirty = (creditDraft[pkg.credits_amount] ?? 0) !== (creditEffective[pkg.credits_amount] ?? 0);
                            const base = minCredit(pkg.credits_amount);
                            const belowBase = base > 0 && cents > 0 && cents <= base;
                            const dotColor = src === "reseller" ? "bg-primary" : "bg-muted-foreground/40";
                            return (
                              <div
                                key={pkg.credits_amount}
                                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-primary/30 transition-all"
                              >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Coins className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold tabular-nums">{pkg.credits_amount}</span>
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">recargas</span>
                                    <span
                                      className={`ml-auto h-1.5 w-1.5 rounded-full ${dotColor}`}
                                      title={src === "reseller" ? "Personalizado" : "Sem preço definido"}
                                    />
                                  </div>
                                  <div className="relative mt-1">
                                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                      R$
                                    </span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min={base > 0 ? (base / 100).toFixed(2) : "0"}
                                      placeholder="—"
                                      value={reais}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        let c = v === "" ? 0 : Math.max(0, Math.round(parseFloat(v) * 100));
                                        if (c > 0 && base > 0 && c <= base) {
                                          toast.warning(`Valor precisa ser maior que ${formatBRL(base)} (custo base)`);
                                          c = base + 1;
                                        }
                                        setCreditDraft((prev) => ({ ...prev, [pkg.credits_amount]: c }));
                                      }}
                                      className={`h-9 pl-7 text-right font-mono text-xs tabular-nums transition-all ${
                                        belowBase
                                          ? "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/30"
                                          : dirty
                                          ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20"
                                          : src === "reseller"
                                          ? "border-primary/30 bg-primary/5"
                                          : ""
                                      }`}
                                      title={base > 0 ? `Custo base: ${formatBRL(base)}` : undefined}
                                    />
                                    {dirty && (
                                      <Pencil className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
                                    )}
                                  </div>
                                  {base > 0 && (
                                    <div className="mt-1 text-right text-[9px] font-mono text-muted-foreground">
                                      {dirty && creditEffective[pkg.credits_amount] > 0
                                        ? <>antes: {formatBRL(creditEffective[pkg.credits_amount])}</>
                                        : <>base: {formatBRL(base)}</>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>
                        Os valores já vêm preenchidos com o preço atual de cada revendedor. Campos que você não alterar continuam herdando o preço normal — só vira <span className="font-bold text-foreground">personalizado</span> se você mudar o valor.
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
