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
  Loader2, Coins, Save, PackagePlus, Pencil, TrendingUp, Sparkles,
  Lightbulb, Target, Rocket, Crown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePricingIssues, issueKey } from "@/hooks/usePricingIssues";
import { AlertTriangle, AlertCircle } from "lucide-react";

type Plan = { id: string; label: string; credits_amount: number; is_active: boolean };
type Override = {
  id: string;
  credits_amount: number;
  price_cents: number;
  is_active: boolean;
};

const PLAN_META: Record<number, { tag: string; tip: string; tone: string }> = {
  10:   { tag: "Teste",     tip: "Pacote de entrada — ideal para o cliente experimentar.", tone: "text-sky-400" },
  50:   { tag: "Básico",    tip: "Boa margem com baixo risco. Ofereça em combo.",          tone: "text-cyan-400" },
  100:  { tag: "Popular",   tip: "Sweet spot: melhor conversão / margem.",                 tone: "text-amber-400" },
  500:  { tag: "Pro",       tip: "Mais vendido entre profissionais. Destaque na loja.",   tone: "text-emerald-400" },
  1000: { tag: "Vitalício", tip: "Ticket alto. Use parcelamento e prova social.",         tone: "text-fuchsia-400" },
};

const formatBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const suggestedPrice = (costCents: number) =>
  ((costCents * 2) / 100).toFixed(2).replace(".", ",");

export default function RevendedorCreditos() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [costs, setCosts] = useState<Record<number, number>>({}); // credits -> cost cents
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, { enabled: boolean; price: string }>>({});
  const [saving, setSaving] = useState(false);
  const { blocked, refresh: refreshIssues } = usePricingIssues();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) return;
      setResellerId(r.id);

      const [
        { data: pl },
        { data: ov },
        costsResponse,
      ] = await Promise.all([
        supabase
          .from("credit_pricing_plans")
          .select("id,label,credits_amount,is_active")
          .eq("is_active", true)
          .order("credits_amount", { ascending: true }),
        supabase
          .from("reseller_credit_prices")
          .select("id,credits_amount,price_cents,is_active")
          .eq("reseller_id", r.id),
        supabase.functions.invoke("reseller-credit-costs", { method: "GET" }),
      ]);

      const planList = (pl ?? []) as Plan[];
      setPlans(planList);
      setOverrides((ov ?? []) as Override[]);

      const costMap = (costsResponse.data as { costs?: Record<number, number> } | null)?.costs ?? {};
      setCosts(costMap);
    } catch (e: any) {
      console.warn("tier prices err", e);
      toast.error(e?.message ?? "Erro ao carregar custos do nível");
      setCosts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const openDialog = () => {
    const next: Record<number, { enabled: boolean; price: string }> = {};
    plans.forEach((p) => {
      const cur = overrides.find((o) => o.credits_amount === p.credits_amount);
      next[p.credits_amount] = cur
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
    // Validar todos os preços ativados antes de salvar qualquer coisa
    for (const p of plans) {
      const d = draft[p.credits_amount];
      if (!d?.enabled) continue;
      const cents = Math.round(parseFloat((d.price ?? "").replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        toast.error(`Pacote ${p.label}: informe um preço de venda válido.`);
        return;
      }
      const cost = costs[p.credits_amount] ?? 0;
      if (cost <= 0) {
        toast.warning(`Pacote ${p.label}: o custo ainda não foi definido pelo gerente. Aguarde a regularização antes de cadastrar o preço.`);
        return;
      }
      if (cents < cost) {
        toast.error(`Pacote ${p.label}: preço (${formatBRL(cents)}) abaixo do custo (${formatBRL(cost)}). Você teria prejuízo.`);
        return;
      }
      if (cents === cost) {
        toast.warning(`Pacote ${p.label}: preço igual ao custo (${formatBRL(cost)}). Você não teria lucro. Aumente o valor.`);
        return;
      }
    }
    setSaving(true);
    try {
      const upserts: { id?: string; credits_amount: number; price_cents: number }[] = [];
      const deletes: string[] = [];

      for (const p of plans) {
        const d = draft[p.credits_amount];
        const cur = overrides.find((o) => o.credits_amount === p.credits_amount);
        const cents = Math.round(parseFloat((d?.price ?? "").replace(",", ".")) * 100);
        const valid = d?.enabled && Number.isFinite(cents) && cents > 0;

        if (valid) {
          upserts.push({ id: cur?.id, credits_amount: p.credits_amount, price_cents: cents });
        } else if (cur) {
          deletes.push(cur.id);
        }
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from("reseller_credit_prices")
          .delete()
          .in("id", deletes);
        if (error) throw error;
      }

      for (const row of upserts) {
        if (row.id) {
          const { error } = await supabase
            .from("reseller_credit_prices")
            .update({ price_cents: row.price_cents, is_active: true })
            .eq("id", row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("reseller_credit_prices")
            .insert({
              reseller_id: resellerId,
              credits_amount: row.credits_amount,
              price_cents: row.price_cents,
              is_active: true,
            });
          if (error) throw error;
        }
      }

      toast.success("Pacotes de recargas salvos");
      closeDialog();
      load();
      refreshIssues();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    return plans.map((p) => {
      const ov = overrides.find((o) => o.credits_amount === p.credits_amount && o.is_active);
      const costCents = costs[p.credits_amount] ?? 0;
      const sale = ov?.price_cents ?? null;
      const margin = sale != null ? sale - costCents : 0;
      const marginPct = sale != null && costCents > 0 ? (margin / costCents) * 100 : 0;
      return { plan: p, override: ov, sale, margin, marginPct, costCents };
    });
  }, [plans, overrides, costs]);

  const activeCount = rows.filter((r) => r.override).length;
  const avgMarginPct = (() => {
    const list = rows.filter((r) => r.override && r.costCents > 0);
    if (list.length === 0) return 0;
    return list.reduce((acc, r) => acc + r.marginPct, 0) / list.length;
  })();
  const totalProfitPerSale = rows.reduce((acc, r) => acc + (r.override ? r.margin : 0), 0);

  return (
    <div>
      <PageHeader
        title="Meus preços — Recargas"
        description="Defina o preço de venda dos pacotes de recargas Lovable e acompanhe sua margem."
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
            Pacotes de <span className="text-foreground font-medium">100 recargas</span> costumam ter melhor conversão.
            Use o pacote de <span className="text-foreground font-medium">10</span> como porta de entrada e o de{" "}
            <span className="text-foreground font-medium">500</span> como carro-chefe.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhum pacote de recargas disponível no momento.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-card/60 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:grid">
            <div className="col-span-3">Pacote</div>
            <div className="col-span-2">Custo do seu nível</div>
            <div className="col-span-2">Seu preço</div>
            <div className="col-span-2">Margem</div>
            <div className="col-span-3">Dica de venda</div>
          </div>

          <div className="divide-y divide-border">
            {rows.map(({ plan: p, override, sale, margin, marginPct, costCents }) => {
              const meta = PLAN_META[p.credits_amount] ?? { tag: "", tip: "", tone: "text-muted-foreground" };
              const suggested = costCents > 0 ? formatBRL(costCents * 2) : "—";
              const inactive = !override;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 md:grid-cols-12 md:items-center",
                    inactive && "opacity-70",
                  )}
                >
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background/50">
                        <Coins className={cn("h-4 w-4", meta.tone)} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-semibold truncate">{p.label}</span>
                          {p.credits_amount === 100 && (
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                              Top
                            </span>
                          )}
                          {p.credits_amount === 1000 && <Crown className="h-3 w-3 text-fuchsia-400" />}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {meta.tag}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Custo do seu nível</div>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {costCents > 0 ? formatBRL(costCents) : "—"}
                    </div>
                  </div>

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

                  <div className="md:col-span-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Margem</div>
                    {sale != null && costCents > 0 ? (
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
                        {sale != null ? "Custo indisponível" : "Não cadastrado"}
                      </span>
                    )}
                  </div>

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
            <DialogTitle>Cadastrar preços de venda — Recargas</DialogTitle>
            <DialogDescription>
              Ative os pacotes de recargas que deseja vender e defina o preço final cobrado dos seus clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {plans.map((p) => {
              const costCents = costs[p.credits_amount] ?? 0;
              const d = draft[p.credits_amount] ?? { enabled: false, price: "" };
              const sugg = costCents > 0 ? suggestedPrice(costCents) : "";
              return (
                <div key={p.id} className="rounded-md border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {costCents > 0 ? `Custo: ${formatBRL(costCents)} • Sugerido: R$ ${sugg}` : "Custo indisponível"}
                      </div>
                    </div>
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(v) =>
                        setDraft((prev) => {
                          const prevPrice = prev[p.credits_amount]?.price ?? "";
                          return {
                            ...prev,
                            [p.credits_amount]: {
                              enabled: v,
                              price: v && !prevPrice && sugg ? sugg : prevPrice,
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
                        {(() => {
                          const priceCents = Math.round(parseFloat((d.price || "0").replace(",", ".")) * 100);
                          if (costCents > 0 && priceCents > 0) {
                            const pct = ((priceCents - costCents) / costCents) * 100;
                            const tone = pct >= 100 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : pct > 0 ? "text-sky-400" : "text-destructive";
                            return (
                              <span className={cn("text-[10px] font-mono", tone)}>
                                {pct >= 0 ? "+" : ""}{pct.toFixed(0)}% sobre o custo
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          className="pl-8 h-8 text-sm"
                          inputMode="decimal"
                          placeholder={sugg || "0,00"}
                          value={d.price}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [p.credits_amount]: { enabled: true, price: e.target.value },
                            }))
                          }
                        />
                      </div>
                      {sugg && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-full text-[11px]"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              [p.credits_amount]: { enabled: true, price: sugg },
                            }))
                          }
                        >
                          <Sparkles className="h-3 w-3 mr-1" /> Usar preço sugerido (R$ {sugg})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar preços
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
