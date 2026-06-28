import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Copy, Check, AlertTriangle, History as HistoryIcon, KeyRound, Wallet, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";

type PlanCode = "5x_7d" | "5x_30d" | "20x_30d" | "pro_30d";
type MarkupMode = "percent" | "fixed_add" | "final";

const PLAN_LABELS: Record<PlanCode, string> = {
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
  "pro_30d": "Pro · 30 dias",
};
const PLAN_ORDER: PlanCode[] = ["5x_7d", "5x_30d", "20x_30d", "pro_30d"];

const PLAN_LIMITS: Record<PlanCode, string> = {
  "5x_7d": "1.250.000 tokens / 12h",
  "5x_30d": "1.250.000 tokens / 12h",
  "20x_30d": "5.000.000 tokens / 12h",
  "pro_30d": "300.000 tokens / 24h",
};

const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function computeSale(cost: number, mode: MarkupMode, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

type PriceRow = { plan_code: PlanCode; sale_price_cents: number; is_active: boolean };

const PLAN_GRADIENTS: Record<PlanCode, string> = {
  "5x_7d": "from-sky-500/20 via-sky-500/5 to-transparent",
  "5x_30d": "from-blue-500/20 via-blue-500/5 to-transparent",
  "20x_30d": "from-primary/25 via-primary/5 to-transparent",
  "pro_30d": "from-amber-500/25 via-amber-500/5 to-transparent",
};
const PLAN_BADGES: Partial<Record<PlanCode, { label: string; cls: string }>> = {
  "20x_30d": { label: "Popular", cls: "bg-primary/15 text-primary border-primary/30" },
  "pro_30d": { label: "Top", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
};

export default function RevendedorClaude() {
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [issuing, setIssuing] = useState<PlanCode | null>(null);
  const [revealed, setRevealed] = useState<{ code: string; plan: PlanCode } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("20x_30d");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);

  const loadAll = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", uid).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const [{ data: def }, { data: ov }, { data: hist }, { data: bal }] = await Promise.all([
      supabase.from("claude_plan_prices").select("plan_code, markup_mode, markup_value_cents, sale_price_cents, is_active"),
      supabase.from("claude_reseller_price_overrides").select("*").eq("reseller_id", r.id),
      supabase.from("claude_orders").select("id, plan_code, status, sale_price_cents, created_at, error_message").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
    ]);

    const merged: PriceRow[] = PLAN_ORDER.map((pc) => {
      const base: any = (def ?? []).find((x: any) => x.plan_code === pc);
      if (!base) return { plan_code: pc, sale_price_cents: 0, is_active: false };
      const override: any = (ov ?? []).find((x: any) => x.plan_code === pc && x.is_active);
      const sale = override ? override.sale_price_cents : base.sale_price_cents;
      return { plan_code: pc, sale_price_cents: sale, is_active: !!base.is_active };
    });
    setPrices(merged);
    setHistory(hist ?? []);
    setBalance(Number((bal as any)?.balance_cents ?? 0));
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const issue = async (plan: PlanCode) => {
    setIssuing(plan);
    const { data, error, skipped } = await invokeAuthenticatedFunction<any>("claude-issue-key", {
      method: "POST",
      body: { plan_code: plan, request_id: crypto.randomUUID() },
    });
    setIssuing(null);
    if (skipped) return toast.error("Sessão expirada");
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Erro ao emitir chave";
      return toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    if (data?.code) {
      setRevealed({ code: data.code, plan });
      loadAll();
    } else {
      toast.error("O fornecedor não retornou o código.");
    }
  };

  const copy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const selected = prices.find((p) => p.plan_code === selectedPlan) ?? prices[0];

  return (
    <PageContainer>
      <PageHeader title="Claude" description="Emita chaves Claude para seus clientes. O valor é debitado da sua carteira." />

      {/* Saldo + Hero */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo da carteira</div>
              <div className="font-display text-2xl font-bold text-emerald-500">{fmtBRL(balance)}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <ClaudeIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Chaves emitidas</div>
              <div className="font-display text-2xl font-bold">{history.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card/80 to-card/40 p-5 sm:p-6 backdrop-blur-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <ClaudeIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-semibold">Nova chave Claude em segundos</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Selecione um plano abaixo. O valor é debitado da sua carteira no momento da emissão.
            </p>
          </div>
        </div>
      </div>

      {/* Plan picker + result */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
            <h3 className="font-display text-sm font-semibold">Escolha o plano</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {prices.map((p) => {
              const active = selectedPlan === p.plan_code;
              const badge = PLAN_BADGES[p.plan_code];
              return (
                <button
                  key={p.plan_code}
                  type="button"
                  onClick={() => p.is_active && setSelectedPlan(p.plan_code)}
                  disabled={!p.is_active}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0",
                    active
                      ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                      : "border-border bg-background/40 hover:border-border/80"
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                      PLAN_GRADIENTS[p.plan_code],
                      active ? "opacity-100" : "opacity-40 group-hover:opacity-70"
                    )}
                  />
                  <div className="relative flex items-start justify-between">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground"
                    )}>
                      <ClaudeIcon className="h-4 w-4" />
                    </div>
                    {badge && (
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="relative mt-3">
                    <div className="font-display text-sm font-semibold">{PLAN_LABELS[p.plan_code]}</div>
                    <div className="text-[11px] text-muted-foreground">{PLAN_LIMITS[p.plan_code]}</div>
                    <div className="mt-2 font-display text-base font-bold">{fmtBRL(p.sale_price_cents)}</div>
                  </div>
                  {active && (
                    <CheckCircle2 className="absolute bottom-2 right-2 h-4 w-4 text-primary animate-scale-in" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">2</span>
            <h3 className="font-display text-sm font-semibold">Emitir chave</h3>
          </div>

          <Button
            onClick={() => selected && issue(selected.plan_code)}
            disabled={!selected?.is_active || issuing !== null}
            size="lg"
            className="w-full relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
          >
            {issuing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><KeyRound className="mr-2 h-4 w-4" /> Gerar chave {selected && PLAN_LABELS[selected.plan_code]}</>
            )}
          </Button>
          {selected && balance < selected.sale_price_cents && (
            <p className="mt-2 text-[11px] text-amber-500">
              Saldo insuficiente. Recarregue sua carteira para emitir este plano.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Últimas emissões</h3>
          </div>
          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma chave emitida ainda.</div>
          ) : (
            <div className="divide-y divide-border">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{PLAN_LABELS[h.plan_code as PlanCode] ?? h.plan_code}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs">{fmtBRL(h.sale_price_cents)}</span>
                    <Badge variant={h.status === "issued" ? "default" : h.status === "failed" ? "destructive" : "secondary"}>
                      {h.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Chave gerada
            </DialogTitle>
            <DialogDescription>
              {revealed && PLAN_LABELS[revealed.plan]}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Copie agora — esta chave <strong>não será exibida novamente</strong>.</span>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-sm break-all select-all">
            {revealed?.code}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealed(null)}>Fechar</Button>
            <Button onClick={copy}>
              {copied ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar chave</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}