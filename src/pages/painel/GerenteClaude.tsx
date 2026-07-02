import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, KeyRound, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";

type PlanCode = "pro_30d" | "5x_30d" | "20x_30d";

const PLAN_LABELS: Record<PlanCode, string> = {
  pro_30d: "Pro · 30 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};
const PLAN_LIMITS: Record<PlanCode, string> = {
  pro_30d: "500 mil tokens / 12h",
  "5x_30d": "2,5 Milhões de tokens / 12h",
  "20x_30d": "10 Milhões de tokens / 12h",
};
const PLAN_ORDER: PlanCode[] = ["pro_30d", "5x_30d", "20x_30d"];

const PLAN_GRADIENTS: Record<PlanCode, string> = {
  pro_30d: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  "5x_30d": "from-blue-500/20 via-blue-500/5 to-transparent",
  "20x_30d": "from-primary/25 via-primary/5 to-transparent",
};

type Row = { plan_code: PlanCode; cost_cents: number; is_active: boolean };

const fmtBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function GerenteClaude() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Row[]>([]);
  const [selected, setSelected] = useState<PlanCode>("20x_30d");
  const [issuing, setIssuing] = useState<PlanCode | null>(null);
  const [revealed, setRevealed] = useState<{ code: string; plan: PlanCode } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("claude_plan_prices")
        .select("plan_code, cost_cents, is_active");
      const rows = PLAN_ORDER
        .map((pc) => {
          const row: any = (data ?? []).find((r: any) => r.plan_code === pc);
          if (!row || !row.is_active) return null;
          return { plan_code: pc, cost_cents: row.cost_cents ?? 0, is_active: true } as Row;
        })
        .filter((x): x is Row => x !== null);
      setPlans(rows);
      if (rows.length && !rows.some((r) => r.plan_code === selected)) {
        setSelected(rows[0].plan_code);
      }
      setLoading(false);
    })();
  }, []);

  const issue = async () => {
    setIssuing(selected);
    const { data, error, skipped } = await invokeAuthenticatedFunction<any>(
      "manager-claude-issue-key",
      { method: "POST", body: { plan_code: selected } },
    );
    setIssuing(null);
    if (skipped) return toast.error("Sessão expirada");
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Erro ao emitir chave";
      return toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    if (data?.code) setRevealed({ code: data.code, plan: selected });
    else toast.error("O fornecedor não retornou o código.");
  };

  const copy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading)
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );

  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClaudeIcon className="h-6 w-6 text-primary" /> Claude — Emitir chave
        </h1>
        <p className="text-muted-foreground">
          Emissão manual de chaves Claude para uso interno. Sem débito de carteira; o custo é do provedor.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        <h3 className="mb-4 font-display text-sm font-semibold">Escolha o plano</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((p) => {
            const active = selected === p.plan_code;
            return (
              <button
                key={p.plan_code}
                type="button"
                onClick={() => setSelected(p.plan_code)}
                className={cn(
                  "group relative overflow-hidden rounded-xl border p-4 text-left transition-all",
                  "hover:-translate-y-0.5 hover:shadow-lg",
                  active
                    ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                    : "border-border bg-background/40",
                )}
              >
                <div
                  className={cn(
                    "absolute inset-0 bg-gradient-to-br opacity-60",
                    PLAN_GRADIENTS[p.plan_code],
                    active ? "opacity-100" : "opacity-40",
                  )}
                />
                <div className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <ClaudeIcon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 font-display text-sm font-semibold">
                    {PLAN_LABELS[p.plan_code]}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {PLAN_LIMITS[p.plan_code]}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Custo provedor:{" "}
                    <span className="font-semibold text-foreground">
                      {fmtBRL(p.cost_cents)}
                    </span>
                  </div>
                </div>
                {active && (
                  <CheckCircle2 className="absolute bottom-2 right-2 h-4 w-4 text-primary" />
                )}
              </button>
            );
          })}
        </div>

        <Button
          onClick={issue}
          disabled={issuing !== null || !plans.length}
          size="lg"
          className="mt-6 w-full"
        >
          {issuing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
            </>
          ) : (
            <>
              <KeyRound className="mr-2 h-4 w-4" /> Gerar chave{" "}
              {PLAN_LABELS[selected]}
            </>
          )}
        </Button>
      </div>

      {revealed && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-primary font-semibold">
            Chave emitida — {PLAN_LABELS[revealed.plan]}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-background/70 px-4 py-3 font-mono text-lg break-all">
              {revealed.code}
            </code>
            <Button variant="outline" size="icon" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Copie e guarde a chave — ela não será exibida novamente.
          </p>
        </div>
      )}
    </PageContainer>
  );
}