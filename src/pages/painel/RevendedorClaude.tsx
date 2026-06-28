import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Copy, Check, AlertTriangle, History as HistoryIcon, KeyRound } from "lucide-react";
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

export default function RevendedorClaude() {
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [issuing, setIssuing] = useState<PlanCode | null>(null);
  const [revealed, setRevealed] = useState<{ code: string; plan: PlanCode } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);

  const loadAll = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", uid).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const [{ data: def }, { data: ov }, { data: hist }] = await Promise.all([
      supabase.from("claude_plan_prices").select("plan_code, markup_mode, markup_value_cents, sale_price_cents, is_active"),
      supabase.from("claude_reseller_price_overrides").select("*").eq("reseller_id", r.id),
      supabase.from("claude_orders").select("id, plan_code, status, sale_price_cents, created_at, error_message").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(20),
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

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="API Claude" description="Emita chaves Claude para seus clientes. O valor é debitado da sua carteira." />

      <div className="grid gap-4 sm:grid-cols-2">
        {prices.map((p) => (
          <div key={p.plan_code} className="rounded-xl border border-border bg-card/60 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-display font-semibold">{PLAN_LABELS[p.plan_code]}</span>
              </div>
              {!p.is_active && <Badge variant="secondary">Indisponível</Badge>}
            </div>
            <div className="mb-4 text-2xl font-bold">{fmtBRL(p.sale_price_cents)}</div>
            <div className="mb-3 text-[11px] text-muted-foreground">{PLAN_LIMITS[p.plan_code]}</div>
            <Button
              className="w-full"
              disabled={!p.is_active || issuing !== null}
              onClick={() => issue(p.plan_code)}
            >
              {issuing === p.plan_code ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Gerar chave
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <HistoryIcon className="h-4 w-4 text-primary" /> Últimas emissões
        </div>
        {history.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma chave emitida ainda.</div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{PLAN_LABELS[h.plan_code as PlanCode] ?? h.plan_code}</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="flex items-center gap-3">
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