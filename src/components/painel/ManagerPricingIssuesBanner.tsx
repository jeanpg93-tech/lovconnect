import { useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { reasonMessage } from "@/hooks/usePricingIssues";
import type { ResellerWithIssues } from "@/hooks/useAllPricingIssues";

type Props = {
  resellers: ResellerWithIssues[];
  className?: string;
};

export default function ManagerPricingIssuesBanner({ resellers, className }: Props) {
  const [open, setOpen] = useState(true);
  if (!resellers || resellers.length === 0) return null;

  const hasCritical = resellers.some((r) => r.has_critical);
  const Icon = hasCritical ? AlertCircle : AlertTriangle;
  const totalIssues = resellers.reduce((acc, r) => acc + r.issues.length, 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
        hasCritical
          ? "border-destructive/50 bg-destructive/10 animate-pulse"
          : "border-amber-500/50 bg-amber-500/10",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            hasCritical ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-600 dark:text-amber-400",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className={cn(
                "font-display text-base font-semibold",
                hasCritical ? "text-destructive" : "text-amber-700 dark:text-amber-300",
              )}
            >
              {hasCritical
                ? `${resellers.length} revendedor(es) com vendas bloqueadas`
                : `${resellers.length} revendedor(es) precisam ajustar preços`}
            </div>
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background/60"
            >
              {open ? "Ocultar" : "Ver detalhes"}
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasCritical
              ? `Há ${totalIssues} produto(s) com prejuízo, sem preço de venda, com custo zerado ou margem zero. As vendas desses produtos estão bloqueadas automaticamente.`
              : `Há ${totalIssues} produto(s) com custo zerado ou margem zero (venda = custo). As vendas estão pausadas até regularização.`}
          </p>

          {open && (
            <ul className="mt-3 space-y-2">
              {resellers.map((r) => (
                <li
                  key={r.reseller_id}
                  className="rounded-lg border border-border/40 bg-background/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          r.has_critical ? "bg-destructive" : "bg-amber-500",
                        )}
                      />
                      <span className="truncate font-medium text-foreground">{r.display_name}</span>
                      <span className="text-xs text-muted-foreground">
                        · {r.issues.length} problema(s)
                      </span>
                    </div>
                    <Link
                      to={`/painel/gerente/revendedores?focus=${r.reseller_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Abrir
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <ul className="mt-2 space-y-1 pl-4 text-xs">
                    {r.issues.slice(0, 6).map((i, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                            i.severity === "critical" ? "bg-destructive" : "bg-amber-500",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-foreground">{i.label}</span>
                          <span className="text-muted-foreground"> — {reasonMessage(i.reason)}</span>
                        </span>
                      </li>
                    ))}
                    {r.issues.length > 6 && (
                      <li className="text-muted-foreground">+ {r.issues.length - 6} outro(s)…</li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}