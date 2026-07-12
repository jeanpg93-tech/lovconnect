import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Tag, Save, PackagePlus, Pencil, TrendingUp, Sparkles,
  Lightbulb, Target, Rocket, Crown, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Plan = { license_type: string; label: string; price_cents: number; is_active: boolean };
type Override = {
  id: string;
  license_type: string;
  price_cents: number;
  is_active: boolean;
};

const FALLBACK_LABEL: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
};
const ORDER = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];

const PLAN_META: Record<string, { tag: string; tip: string; tone: string }> = {
  pro_1d:    { tag: "Teste",       tip: "Ideal para teste rápido — converta em planos maiores.", tone: "text-sky-400" },
  pro_7d:    { tag: "Semanal",     tip: "Bom gatilho de entrada. Ofereça upgrade no 5º dia.",   tone: "text-cyan-400" },
  pro_15d:   { tag: "Quinzenal",   tip: "Sweet spot: margem boa e baixa rejeição.",              tone: "text-amber-400" },
  pro_30d:   { tag: "Mensal",      tip: "Mais vendido. Combine com brinde para fidelizar.",     tone: "text-emerald-400" },
  lifetime:  { tag: "Vitalícia",   tip: "Ticket alto. Use parcelamento e prova social.",         tone: "text-fuchsia-400" },
};

const formatBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const suggestedPrice = (costCents: number) =>
  ((costCents * 2) / 100).toFixed(2).replace(".", ",");

type Props = { extensionId?: string | null };

export default function RevendedorExtensoes({ extensionId = null }: Props = {}) {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [tier, setTier] = useState<any>(null);
  const [tierExtensionPrices, setTierExtensionPrices] = useState<Record<string, number>>({});
  const [partnerOverrides, setPartnerOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; price: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const ovQuery = supabase
      .from("reseller_extension_prices")
      .select("id,license_type,price_cents,is_active,extension_id")
      .eq("reseller_id", r.id);
    const tepQuery = supabase
      .from("tier_extension_prices")
      .select("tier_id,license_type,price_cents,is_active,extension_id")
      .eq("is_active", true);
    const povQuery = supabase
      .from("reseller_extension_price_overrides")
      .select("license_type,price_cents,is_active,extension_id")
      .eq("reseller_id", r.id);

    if (extensionId) {
      ovQuery.eq("extension_id", extensionId);
      tepQuery.eq("extension_id", extensionId);
      povQuery.eq("extension_id", extensionId);
    } else {
      ovQuery.is("extension_id", null);
      povQuery.is("extension_id", null);
    }

    const [{ data: pl }, { data: ov }, { data: tierData }, { data: tep }, { data: pov }] = await Promise.all([
      supabase
        .from("pricing_plans_public" as any)
        .select("license_type,label,price_cents,is_active")
        .eq("is_active", true),
      ovQuery,
      supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
      tepQuery,
      povQuery,
    ]);

    setPlans(((pl ?? []) as Plan[])
      .filter(p => ORDER.includes(p.license_type))
      .sort((a, b) => ORDER.indexOf(a.license_type) - ORDER.indexOf(b.license_type)));
    setOverrides((ov ?? []) as Override[]);

    const curTier = Array.isArray(tierData) ? tierData[0] : tierData;
    setTier(curTier);

    const tepMap: Record<string, number> = {};
    (tep ?? []).forEach((row: any) => {
      if (row.tier_id === curTier?.id) {
        tepMap[row.license_type] = row.price_cents;
      }
    });
    setTierExtensionPrices(tepMap);

    const povMap: Record<string, number> = {};
    (pov ?? []).forEach((row: any) => {
      if (row.is_active) {
        povMap[row.license_type] = row.price_cents;
      }
    });
    setPartnerOverrides(povMap);

    setLoading(false);
  };

  useEffect(() => { load(); }, [user, extensionId]);

  const openDialog = () => {
    const next: Record<string, { enabled: boolean; price: string }> = {};
    plans.forEach((p) => {
      const cur = overrides.find((o) => o.license_type === p.license_type);
      next[p.license_type] = cur
        ? {
            enabled: cur.is_active,
            price: (cur.price_cents / 100).toFixed(2).replace(".", ","),
          }
        : { enabled: false, price: "" };
    });
    setDraft(next);
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setDraft({});
  };

  const save = async () => {
    if (!resellerId) return;
    setSaving(true);
    try {
      const upserts: { id?: string; license_type: string; price_cents: number }[] = [];
      const deletes: string[] = [];

      for (const p of plans) {
        const d = draft[p.license_type];
        const cur = overrides.find((o) => o.license_type === p.license_type);
        const cents = Math.round(parseFloat((d?.price ?? "").replace(",", ".")) * 100);
        const valid = d?.enabled && Number.isFinite(cents) && cents > 0;

        if (valid) {
          upserts.push({ id: cur?.id, license_type: p.license_type, price_cents: cents });
        } else if (cur) {
          deletes.push(cur.id);
        }
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from("reseller_extension_prices")
          .delete()
          .in("id", deletes);
        if (error) throw error;
      }

      for (const row of upserts) {
        if (row.id) {
          const { error } = await supabase
            .from("reseller_extension_prices")
            .update({ price_cents: row.price_cents, is_active: true })
            .eq("id", row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("reseller_extension_prices")
            .insert({
              reseller_id: resellerId,
              extension_id: extensionId,
              license_type: row.license_type,
              price_cents: row.price_cents,
              is_active: true,
            });
          if (error) throw error;
        }
      }

      toast.success("Pacotes salvos");
      closeDialog();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const planByType = (lt: string) => plans.find((p) => p.license_type === lt);

  // Lista combinada na ordem oficial: mostra TODOS os planos, marcando os cadastrados.
  const rows = useMemo(() => {
    return plans.map((p) => {
      const ov = overrides.find((o) => o.license_type === p.license_type && o.is_active);
      
      // Cálculo do custo real do revendedor
      const partnerPrice = partnerOverrides[p.license_type];
      const tierPrice = tierExtensionPrices[p.license_type];
      const discountPct = Number(tier?.discount_percent ?? 0);
      const costCents = partnerPrice ?? (tierPrice ?? Math.round(p.price_cents * (1 - discountPct / 100)));

      const sale = ov?.price_cents ?? null;
      const margin = sale != null ? sale - costCents : 0;
      const marginPct = sale != null && costCents > 0 ? (margin / costCents) * 100 : 0;
      return { plan: p, override: ov, sale, margin, marginPct, costCents };
    });
  }, [plans, overrides, tier, tierExtensionPrices]);

  const activeCount = rows.filter((r) => r.override).length;
  const avgMarginPct = (() => {
    const list = rows.filter((r) => r.override);
    if (list.length === 0) return 0;
    return list.reduce((acc, r) => acc + r.marginPct, 0) / list.length;
  })();
  const totalProfitPerSale = rows.reduce((acc, r) => acc + (r.override ? r.margin : 0), 0);

  return (
    <div>
      <PageHeader
        title="Meus preços"
        description="Defina o preço de venda de cada licença e acompanhe sua margem em tempo real."
        actions={
          <Button onClick={openDialog} disabled={plans.length === 0}>
            {activeCount > 0 ? (
              <Pencil className="h-4 w-4 mr-1.5" />
            ) : (
              <PackagePlus className="h-4 w-4 mr-1.5" />
            )}
            {activeCount > 0 ? "Editar preços" : "Cadastrar preços"}
          </Button>
        }
      />

      {/* Stats + Dicas */}
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Pacotes ativos
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold">
            {activeCount}<span className="text-sm text-muted-foreground"> / {plans.length}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Margem média
          </div>
          <div className={cn(
            "mt-1.5 font-display text-2xl font-bold",
            avgMarginPct >= 100 ? "text-emerald-400" : avgMarginPct >= 50 ? "text-amber-400" : "text-muted-foreground",
          )}>
            {activeCount > 0 ? `${avgMarginPct.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <Rocket className="h-3.5 w-3.5" /> Lucro / pacote completo
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-emerald-400">
            {activeCount > 0 ? formatBRL(totalProfitPerSale) : "—"}
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Lightbulb className="h-4.5 w-4.5" />
        </div>
        <div className="text-sm">
          <div className="font-display font-semibold">Dica do dia</div>
          <p className="mt-0.5 text-muted-foreground">
            Margens entre <span className="text-emerald-400 font-medium">80–120%</span> costumam ter a melhor conversão.
            Use a licença de <span className="text-foreground font-medium">7 dias</span> como porta de entrada e a de{" "}
            <span className="text-foreground font-medium">30 dias</span> como carro-chefe.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma licença disponível no momento.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
          {/* Header da tabela */}
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-card/60 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:grid">
            <div className="col-span-3">Licença</div>
            <div className="col-span-2">Custo base (Provedor)</div>
            <div className="col-span-2">Seu preço</div>
            <div className="col-span-2">Margem</div>
            <div className="col-span-3">Dica de venda</div>
          </div>

          <div className="divide-y divide-border">
            {rows.map(({ plan: p, override, sale, margin, marginPct, costCents }) => {
              const meta = PLAN_META[p.license_type] ?? { tag: "", tip: "", tone: "text-muted-foreground" };
              const suggested = formatBRL(costCents * 2);
              const inactive = !override;
              return (
                <div
                  key={p.license_type}
                  className={cn(
                    "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 md:grid-cols-12 md:items-center",
                    inactive && "opacity-70",
                  )}
                >
                  {/* Licença */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background/50">
                        <Tag className={cn("h-4 w-4", meta.tone)} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-semibold truncate">
                            {p.label || FALLBACK_LABEL[p.license_type]}
                          </span>
                          {p.license_type === "pro_30d" && (
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                              Top
                            </span>
                          )}
                          {p.license_type === "lifetime" && (
                            <Crown className="h-3 w-3 text-fuchsia-400" />
                          )}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {meta.tag}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Custo */}
                  <div className="md:col-span-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Custo (Provedor)</div>
                    <div className="text-sm tabular-nums text-muted-foreground">{formatBRL(costCents)}</div>
                  </div>

                  {/* Preço */}
                  <div className="md:col-span-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Seu preço</div>
                    {sale != null ? (
                      <div className="font-display text-base font-bold tabular-nums">{formatBRL(sale)}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Sugerido: <span className="text-foreground font-medium">{suggested}</span>
                      </div>
                    )}
                  </div>

                  {/* Margem */}
                  <div className="md:col-span-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Margem</div>
                    {sale != null ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                            marginPct >= 100 ? "bg-emerald-500/15 text-emerald-400" :
                            marginPct >= 50  ? "bg-amber-500/15 text-amber-400" :
                            marginPct >= 0   ? "bg-muted text-muted-foreground" :
                                               "bg-destructive/15 text-destructive",
                          )}
                        >
                          <TrendingUp className="h-3 w-3" />
                          {margin >= 0 ? "+" : ""}{marginPct.toFixed(0)}%
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {margin >= 0 ? "+" : ""}{formatBRL(margin)}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        Não cadastrado
                      </span>
                    )}
                  </div>

                  {/* Dica */}
                  <div className="md:col-span-3">
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className={cn("mt-0.5 h-3 w-3 shrink-0", meta.tone)} />
                      <span className="leading-snug">{meta.tip}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar preços de venda</DialogTitle>
            <DialogDescription>
              Ative as licenças que deseja vender e defina o preço final cobrado dos seus clientes.
              Os valores ao lado são o preço base do gerente (seu custo).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {plans.map((p) => {
              const r = rows.find(x => x.plan.license_type === p.license_type);
              const costCents = r?.costCents ?? p.price_cents;
              const d = draft[p.license_type] ?? { enabled: false, price: "" };
              return (
                <div
                  key={p.license_type}
                  className="rounded-md border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {p.label || FALLBACK_LABEL[p.license_type]}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Preço Sugerido: {suggestedPrice(costCents)}
                      </div>
                    </div>
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(v) =>
                        setDraft((prev) => {
                          const prevPrice = prev[p.license_type]?.price ?? "";
                          return {
                            ...prev,
                            [p.license_type]: {
                              enabled: v,
                              price: v && !prevPrice ? suggestedPrice(costCents) : prevPrice,
                            },
                          };
                        })
                      }
                    />
                  </div>
                  {d.enabled && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Seu preço de venda</Label>
                        <span className="text-[10px] text-muted-foreground">
                          Sugerido: R$ {suggestedPrice(p.price_cents)} <span className="text-emerald-500 font-medium">(+100%)</span>
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          R$
                        </span>
                        <Input
                          className="pl-8 h-8 text-sm"
                          inputMode="decimal"
                          placeholder={suggestedPrice(p.price_cents)}
                          value={d.price}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [p.license_type]: { enabled: true, price: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar preços
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
