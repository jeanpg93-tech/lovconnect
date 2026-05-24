import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Save, Crown, Users, Tag, Search, Sparkles, RotateCcw, CheckCircle2, Pencil, Coins, Calendar, ChevronDown,
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
type Reseller = { id: string; display_name: string };
type State = { reseller_id: string; forced_tier_id: string | null; total_spent_cents: number };
type CreditPackage = { credits_amount: number; label: string };
type LicensePack = { id: string; label: string };
const LICENSE_PACKS: LicensePack[] = [
  { id: "1d", label: "1 dia" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "365d", label: "365 dias" },
  { id: "lifetime", label: "Vitalício" },
];

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function GerentePartners() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [selectedResellerId, setSelectedResellerId] = useState<string>("");
  const [search, setSearch] = useState("");

  // === Custo de licenças (por pack) ===
  // chave = pack_id (1d, 7d, ...)
  const [licEffective, setLicEffective] = useState<Record<string, number>>({});
  const [licDraft, setLicDraft] = useState<Record<string, number>>({});
  const [licSource, setLicSource] = useState<Record<string, "override" | "tier" | "ouro" | "none">>({});

  // === Custo de recargas ===
  const [creditEffective, setCreditEffective] = useState<Record<number, number>>({});
  const [creditDraft, setCreditDraft] = useState<Record<number, number>>({});
  const [creditSource, setCreditSource] = useState<Record<number, "override" | "tier" | "ouro" | "none">>({});

  // licencas.valores cache (origem dos custos de licença por tier)
  const [licencasValores, setLicencasValores] = useState<Record<string, any>>({});
  // Preços de créditos do nível Ouro (fallback)
  const [ouroCreditPrices, setOuroCreditPrices] = useState<Record<number, number>>({});
  // Preços de créditos do tier atual do parceiro
  const [tierCreditPrices, setTierCreditPrices] = useState<Record<number, number>>({});

  // Sessões minimizáveis
  const [licOpen, setLicOpen] = useState(true);
  const [creditOpen, setCreditOpen] = useState(true);

  // Texto bruto dos inputs (para não perder estado intermediário ao digitar)
  const [licText, setLicText] = useState<Record<string, string>>({});
  const [creditText, setCreditText] = useState<Record<number, string>>({});

  // Marca quais campos o usuário tocou (para garantir persistência independente do diff)
  const [licTouched, setLicTouched] = useState<Record<string, boolean>>({});
  const [creditTouched, setCreditTouched] = useState<Record<number, boolean>>({});

  const centsToText = (c: number) => (c > 0 ? (c / 100).toFixed(2) : "");
  const textToCents = (s: string) => {
    const cleaned = s.replace(",", ".").trim();
    if (!cleaned) return 0;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };

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
    for (const k of Object.keys(licDraft)) {
      if ((licDraft[k] ?? 0) !== (licEffective[k] ?? 0)) n++;
    }
    for (const k of Object.keys(creditDraft)) {
      if ((creditDraft[Number(k)] ?? 0) !== (creditEffective[Number(k)] ?? 0)) n++;
    }
    return n;
  }, [licDraft, licEffective, creditDraft, creditEffective]);

  const customCount = useMemo(
    () =>
      Object.values(licSource).filter((s) => s === "override").length +
      Object.values(creditSource).filter((s) => s === "override").length,
    [licSource, creditSource],
  );

  const loadBase = async () => {
    setLoading(true);
    const [{ data: t }, { data: r }, { data: s }, { data: cp }, { data: lv }] = await Promise.all([
      supabase.from("reseller_tiers").select("id,slug,name,color,is_active,is_hidden,min_spent_cents,sort_order").order("sort_order"),
      supabase.from("resellers").select("id,display_name").order("display_name"),
      supabase.from("reseller_tier_state").select("reseller_id,forced_tier_id,total_spent_cents"),
      supabase.from("credit_pricing_plans").select("credits_amount,label,price_cents,is_active").eq("is_active", true).order("credits_amount"),
      supabase.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
    ]);
    const tierList = (t ?? []) as Tier[];
    setTiers(tierList);
    setResellers((r ?? []) as Reseller[]);
    setCreditPackages(((cp ?? []) as any[]).map((p) => ({ credits_amount: p.credits_amount, label: p.label })));
    setLicencasValores(((lv as any)?.value ?? {}) as Record<string, any>);

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

    const firstPartner =
      tierList.find((x) => x.is_active && x.slug === "partner") ||
      tierList.find((x) => x.is_active && (x.name || "").toLowerCase().includes("partner")) ||
      tierList.find((x) => x.is_active && x.is_hidden);
    if (firstPartner) setSelectedTierId((cur) => cur || firstPartner.id);
    setLoading(false);
  };

  // Carrega CUSTOS efetivos + origem
  const loadEffectivePrices = async (resellerId: string) => {
    setLoadingPrices(true);
    const isPartnerTier = (selectedTier?.is_hidden || selectedTier?.slug === "partner") ?? false;
    const tierId = selectedTier?.id;
    const ouroTier = tiers.find((x) => x.slug === "ouro") ?? tiers.find((x) => x.name.toLowerCase().includes("ouro"));

    // Tier credit prices do tier do parceiro (caso não seja Partner)
    let tierCpMap: Record<number, number> = {};
    if (tierId && !isPartnerTier) {
      const { data: tcp } = await supabase
        .from("tier_credit_prices")
        .select("price_cents,is_active,credit_pricing_plans!inner(credits_amount)")
        .eq("tier_id", tierId)
        .eq("is_active", true);
      (tcp ?? []).forEach((row: any) => {
        const amount = row.credit_pricing_plans?.credits_amount;
        if (amount != null && row.price_cents > 0) tierCpMap[amount] = row.price_cents;
      });
    }
    setTierCreditPrices(tierCpMap);

    const [{ data: licOvs }, { data: credOvs }] = await Promise.all([
      supabase
        .from("reseller_license_cost_overrides")
        .select("pack_id,price_cents,is_active")
        .eq("reseller_id", resellerId)
        .eq("is_active", true),
      supabase
        .from("reseller_credit_cost_overrides")
        .select("credits_amount,price_cents,is_active")
        .eq("reseller_id", resellerId)
        .eq("is_active", true),
    ]);

    // === LICENÇAS (custo) ===
    const licOvMap = new Map<string, number>();
    (licOvs ?? []).forEach((o: any) => {
      if (o.price_cents > 0) licOvMap.set(o.pack_id, o.price_cents);
    });

    // Custo do tier por pack (flow e lovax compartilham → priorizamos flow, fallback lovax)
    const lv = (licencasValores ?? {}) as any;
    // licencas.valores está em REAIS (ex: 5.02) → convertemos para centavos
    const reaisToCents = (v: any) => Math.round(Number(v ?? 0) * 100);
    const readPackCents = (packId: string, tId: string): number => {
      return (
        reaisToCents(lv?.flow?.[packId]?.[tId]) ||
        reaisToCents(lv?.lovax?.[packId]?.[tId])
      );
    };

    const lEff: Record<string, number> = {};
    const lSrc: Record<string, "override" | "tier" | "ouro" | "none"> = {};
    for (const pack of LICENSE_PACKS) {
      if (licOvMap.has(pack.id)) {
        lEff[pack.id] = licOvMap.get(pack.id)!;
        lSrc[pack.id] = "override";
      } else {
        // Tenta tier real
        const direct = tierId ? readPackCents(pack.id, tierId) : 0;
        if (direct > 0) {
          lEff[pack.id] = direct;
          lSrc[pack.id] = "tier";
        } else if (isPartnerTier && ouroTier?.id) {
          const fromOuro = readPackCents(pack.id, ouroTier.id);
          if (fromOuro > 0) {
            lEff[pack.id] = fromOuro;
            lSrc[pack.id] = "ouro";
          } else {
            lEff[pack.id] = 0;
            lSrc[pack.id] = "none";
          }
        } else {
          lEff[pack.id] = 0;
          lSrc[pack.id] = "none";
        }
      }
    }

    // === RECARGAS (custo) ===
    const credOvMap = new Map<number, number>();
    (credOvs ?? []).forEach((o: any) => {
      if (o.price_cents > 0) credOvMap.set(o.credits_amount, o.price_cents);
    });
    const cEff: Record<number, number> = {};
    const cSrc: Record<number, "override" | "tier" | "ouro" | "none"> = {};
    for (const pkg of creditPackages) {
      if (credOvMap.has(pkg.credits_amount)) {
        cEff[pkg.credits_amount] = credOvMap.get(pkg.credits_amount)!;
        cSrc[pkg.credits_amount] = "override";
      } else if (tierCpMap[pkg.credits_amount] != null) {
        cEff[pkg.credits_amount] = tierCpMap[pkg.credits_amount];
        cSrc[pkg.credits_amount] = "tier";
      } else if (isPartnerTier && ouroCreditPrices[pkg.credits_amount] != null) {
        cEff[pkg.credits_amount] = ouroCreditPrices[pkg.credits_amount];
        cSrc[pkg.credits_amount] = "ouro";
      } else {
        cEff[pkg.credits_amount] = 0;
        cSrc[pkg.credits_amount] = "none";
      }
    }

    setLicEffective(lEff);
    setLicSource(lSrc);
    setLicDraft({ ...lEff });
    setLicText(Object.fromEntries(Object.entries(lEff).map(([k, v]) => [k, centsToText(v as number)])));
    setCreditEffective(cEff);
    setCreditSource(cSrc);
    setCreditDraft({ ...cEff });
    setCreditText(Object.fromEntries(Object.entries(cEff).map(([k, v]) => [Number(k), centsToText(v as number)])) as Record<number, string>);
    setLicTouched({});
    setCreditTouched({});
    setLoadingPrices(false);
  };

  useEffect(() => { loadBase(); }, []);

  useEffect(() => {
    setSelectedResellerId("");
    setLicEffective({}); setLicDraft({}); setLicSource({}); setLicText({});
    setCreditEffective({}); setCreditDraft({}); setCreditSource({}); setCreditText({});
    setLicTouched({}); setCreditTouched({});
  }, [selectedTierId]);

  useEffect(() => {
    if (selectedResellerId) loadEffectivePrices(selectedResellerId);
    else {
      setLicEffective({}); setLicDraft({}); setLicSource({}); setLicText({});
      setCreditEffective({}); setCreditDraft({}); setCreditSource({}); setCreditText({});
      setLicTouched({}); setCreditTouched({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResellerId, creditPackages.length]);

  const save = async () => {
    if (!selectedResellerId) return;
    setSaving(true);

    // === LICENÇAS (overrides de custo) ===
    // Para cada pack: persistir (upsert) se tiver valor > 0 e (o usuário tocou OU diferente do herdado OU já era override).
    // Apagar (override -> herdado) se o valor for 0/vazio E já existia override.
    const licUpserts: any[] = [];
    const licDeletes: string[] = [];
    for (const pack of LICENSE_PACKS) {
      const v = Number(licDraft[pack.id] ?? 0);
      const wasOverride = licSource[pack.id] === "override";
      const touched = !!licTouched[pack.id];
      const changed = v !== Number(licEffective[pack.id] ?? 0);
      if (v > 0 && (touched || changed || wasOverride)) {
        licUpserts.push({
          reseller_id: selectedResellerId,
          pack_id: pack.id,
          price_cents: Math.round(v),
          is_active: true,
        });
      } else if (v <= 0 && wasOverride) {
        licDeletes.push(pack.id);
      }
    }
    if (licDeletes.length) {
      const { error } = await supabase
        .from("reseller_license_cost_overrides")
        .delete()
        .eq("reseller_id", selectedResellerId)
        .in("pack_id", licDeletes);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (licUpserts.length) {
      const { error } = await supabase
        .from("reseller_license_cost_overrides")
        .upsert(licUpserts, { onConflict: "reseller_id,pack_id" });
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    // === CRÉDITOS (overrides de custo) ===
    const credUpserts: any[] = [];
    const credDeletes: number[] = [];
    for (const pkg of creditPackages) {
      // Prioriza o texto digitado (mais confiável que creditDraft em casos de race)
      const raw = creditText[pkg.credits_amount];
      const v = raw !== undefined
        ? textToCents(raw)
        : Number(creditDraft[pkg.credits_amount] ?? 0);
      const wasOverride = creditSource[pkg.credits_amount] === "override";
      const touched = !!creditTouched[pkg.credits_amount];
      const changed = v !== Number(creditEffective[pkg.credits_amount] ?? 0);
      if (v > 0 && (touched || changed || wasOverride)) {
        credUpserts.push({
          reseller_id: selectedResellerId,
          credits_amount: pkg.credits_amount,
          price_cents: Math.round(v),
          is_active: true,
        });
      } else if (v <= 0 && wasOverride) {
        credDeletes.push(pkg.credits_amount);
      }
    }
    if (credDeletes.length) {
      const { error } = await supabase
        .from("reseller_credit_cost_overrides")
        .delete()
        .eq("reseller_id", selectedResellerId)
        .in("credits_amount", credDeletes);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (credUpserts.length) {
      const { error } = await supabase
        .from("reseller_credit_cost_overrides")
        .upsert(credUpserts, { onConflict: "reseller_id,credits_amount" });
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success(`Custos salvos para ${selectedReseller?.display_name}`);
    await loadEffectivePrices(selectedResellerId);
    setSaving(false);
  };

  const resetDraft = () => {
    setLicDraft({ ...licEffective });
    setCreditDraft({ ...creditEffective });
    setLicText(Object.fromEntries(Object.entries(licEffective).map(([k, v]) => [k, centsToText(v as number)])));
    setCreditText(Object.fromEntries(Object.entries(creditEffective).map(([k, v]) => [Number(k), centsToText(v as number)])) as Record<number, string>);
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
          {/* Header compacto: nível Partner + contagem */}
          {selectedTier && (
            <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm flex flex-wrap items-center gap-3">
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                style={{ background: `${selectedTier.color}22`, color: selectedTier.color }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold flex items-center gap-2">
                  Nível
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: `${selectedTier.color}1f`, color: selectedTier.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: selectedTier.color }} />
                    {selectedTier.name}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Defina custos individuais para cada parceiro deste nível.
                </p>
              </div>
              <div className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                <div className="leading-tight">
                  <div className="text-sm font-bold tabular-nums">{partnersOfTier.length}</div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                    parceiro{partnersOfTier.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                      <button
                        type="button"
                        onClick={() => setLicOpen((v) => !v)}
                        className="w-full px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3 hover:bg-muted/30 transition-colors"
                        aria-expanded={licOpen}
                      >
                        <div className="h-6 w-1 bg-primary rounded-full" />
                        <h3 className="font-display text-sm font-bold tracking-tight flex items-center gap-2">
                          <Tag className="h-4 w-4 text-primary" /> Custo de licenças (PromptFlow / LovaX)
                        </h3>
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] tabular-nums">
                          {LICENSE_PACKS.length}
                        </Badge>
                        <ChevronDown
                          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${licOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {licOpen && (loadingPrices ? (
                        <div className="flex h-40 items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="grid gap-2 p-3 sm:p-4 sm:grid-cols-2 lg:grid-cols-3">
                          {LICENSE_PACKS.map((pack) => {
                            const cents = licDraft[pack.id] ?? 0;
                            const reais = licText[pack.id] ?? centsToText(cents);
                            const src = licSource[pack.id] ?? "none";
                            const dirty = (licDraft[pack.id] ?? 0) !== (licEffective[pack.id] ?? 0);
                            const dotColor =
                              src === "override"
                                ? "bg-primary"
                                : src === "tier"
                                ? "bg-blue-500/70"
                                : src === "ouro"
                                ? "bg-amber-400"
                                : "bg-muted-foreground/40";
                            const dotTitle =
                              src === "override"
                                ? "Custo personalizado deste parceiro"
                                : src === "tier"
                                ? `Custo do nível ${selectedTier?.name ?? ""}`
                                : src === "ouro"
                                ? "Herdado do nível Ouro"
                                : "Sem custo definido";
                            return (
                              <div
                                key={pack.id}
                                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-primary/30 transition-all"
                              >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Calendar className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold">{pack.label}</span>
                                    <span
                                      className={`ml-auto h-1.5 w-1.5 rounded-full ${dotColor}`}
                                      title={dotTitle}
                                    />
                                  </div>
                                  <div className="relative mt-1">
                                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                      R$
                                    </span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="—"
                                      value={reais}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setLicText((prev) => ({ ...prev, [pack.id]: v }));
                                        const c = textToCents(v);
                                        setLicDraft((prev) => ({ ...prev, [pack.id]: c }));
                                        setLicTouched((prev) => ({ ...prev, [pack.id]: true }));
                                      }}
                                      onBlur={(e) => {
                                        const c = textToCents(e.target.value);
                                        setLicText((prev) => ({ ...prev, [pack.id]: centsToText(c) }));
                                      }}
                                      className={`h-9 pl-7 text-right font-mono text-xs tabular-nums transition-all ${
                                        dirty
                                          ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20"
                                          : src === "override"
                                          ? "border-primary/30 bg-primary/5"
                                          : ""
                                      }`}
                                    />
                                    {dirty && (
                                      <Pencil className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
                                    )}
                                  </div>
                                  {licEffective[pack.id] > 0 && (
                                    <div className="mt-1 text-right text-[9px] font-mono text-muted-foreground">
                                      {dirty
                                        ? <>antes: {formatBRL(licEffective[pack.id])}</>
                                        : src === "ouro"
                                        ? <>herdado do Ouro</>
                                        : src === "tier"
                                        ? <>custo do nível</>
                                        : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Card: matriz de preços de recargas */}
                    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCreditOpen((v) => !v)}
                        className="w-full px-4 sm:px-5 py-3 border-b border-border flex items-center gap-3 hover:bg-muted/30 transition-colors"
                        aria-expanded={creditOpen}
                      >
                        <div className="h-6 w-1 bg-primary rounded-full" />
                        <h3 className="font-display text-sm font-bold tracking-tight flex items-center gap-2">
                          <Coins className="h-4 w-4 text-primary" /> Custo de recargas
                        </h3>
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] tabular-nums">
                          {creditPackages.length}
                        </Badge>
                        <ChevronDown
                          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${creditOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {creditOpen && (loadingPrices ? (
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
                            const reais = creditText[pkg.credits_amount] ?? centsToText(cents);
                            const src = creditSource[pkg.credits_amount] ?? "none";
                            const dirty = (creditDraft[pkg.credits_amount] ?? 0) !== (creditEffective[pkg.credits_amount] ?? 0);
                            const dotColor =
                              src === "override"
                                ? "bg-primary"
                                : src === "tier"
                                ? "bg-blue-500/70"
                                : src === "ouro"
                                ? "bg-amber-400"
                                : "bg-muted-foreground/40";
                            const dotTitle =
                              src === "override"
                                ? "Custo personalizado deste parceiro"
                                : src === "tier"
                                ? `Custo do nível ${selectedTier?.name ?? ""}`
                                : src === "ouro"
                                ? "Herdado do nível Ouro"
                                : "Sem custo definido";
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
                                      title={dotTitle}
                                    />
                                  </div>
                                  <div className="relative mt-1">
                                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                      R$
                                    </span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="—"
                                      value={reais}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setCreditText((prev) => ({ ...prev, [pkg.credits_amount]: v }));
                                        const c = textToCents(v);
                                        setCreditDraft((prev) => ({ ...prev, [pkg.credits_amount]: c }));
                                        setCreditTouched((prev) => ({ ...prev, [pkg.credits_amount]: true }));
                                      }}
                                      onBlur={(e) => {
                                        const c = textToCents(e.target.value);
                                        setCreditText((prev) => ({ ...prev, [pkg.credits_amount]: centsToText(c) }));
                                      }}
                                      className={`h-9 pl-7 text-right font-mono text-xs tabular-nums transition-all ${
                                        dirty
                                          ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20"
                                          : src === "override"
                                          ? "border-primary/30 bg-primary/5"
                                          : ""
                                      }`}
                                    />
                                    {dirty && (
                                      <Pencil className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-500" />
                                    )}
                                  </div>
                                  {creditEffective[pkg.credits_amount] > 0 && (
                                    <div className="mt-1 text-right text-[9px] font-mono text-muted-foreground">
                                      {dirty
                                        ? <>antes: {formatBRL(creditEffective[pkg.credits_amount])}</>
                                        : src === "ouro"
                                        ? <>herdado do Ouro</>
                                        : src === "tier"
                                        ? <>custo do nível</>
                                        : null}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>
                        Aqui você define o <span className="font-bold text-foreground">custo</span> que será descontado do saldo deste parceiro a cada venda. O preço de venda continua sendo definido pelo próprio revendedor. Campos não alterados continuam herdando o custo do nível (ou de <span className="font-bold text-foreground">Ouro</span> se for Partner).
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
