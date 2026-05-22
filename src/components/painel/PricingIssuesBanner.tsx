import { AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { reasonMessage, type PricingIssue } from "@/hooks/usePricingIssues";

type Props = {
  issues: PricingIssue[];
  className?: string;
  /** caminho do botão "Corrigir agora" — default /painel/revendedor/precos */
  fixHref?: string;
  compact?: boolean;
};

export default function PricingIssuesBanner({ issues, className, fixHref = "/painel/revendedor/precos", compact }: Props) {
  if (!issues || issues.length === 0) return null;

  const hasCritical = issues.some((i) => i.severity === "critical");
  const Icon = hasCritical ? AlertCircle : AlertTriangle;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
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
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            hasCritical ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-600 dark:text-amber-400",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-display font-semibold",
              hasCritical ? "text-destructive" : "text-amber-700 dark:text-amber-300",
            )}
          >
            {hasCritical ? "Atenção urgente: vendas bloqueadas" : "Ajuste necessário nos seus preços"}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasCritical
              ? "Alguns produtos estão configurados com prejuízo ou sem preço. As vendas foram bloqueadas até você corrigir."
              : "Alguns produtos precisam de ajuste de preço ou aguardam o gerente regularizar o custo. As vendas estão pausadas."}
          </p>

          {!compact && (
            <ul className="mt-2 space-y-1 text-xs">
              {issues.slice(0, 5).map((i, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      i.severity === "critical" ? "bg-destructive" : "bg-amber-500",
                    )}
                  />
                  <span>
                    <span className="font-medium text-foreground">{i.label}</span>
                    <span className="text-muted-foreground"> — {reasonMessage(i.reason)}</span>
                  </span>
                </li>
              ))}
              {issues.length > 5 && (
                <li className="text-muted-foreground">+ {issues.length - 5} outro(s)…</li>
              )}
            </ul>
          )}

          <Link
            to={fixHref}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              hasCritical
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-amber-500 text-white hover:bg-amber-600",
            )}
          >
            Corrigir agora
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}