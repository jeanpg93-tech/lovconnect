import { AlertTriangle, AlertCircle, ArrowRight, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

export default function PackLowBalanceBanner() {
  const { isPack, packCredits } = useRole();

  if (!isPack) return null;
  if (packCredits > 3) return null;

  const isZero = packCredits === 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        isZero
          ? "border-destructive/50 bg-destructive/10"
          : "border-amber-500/50 bg-amber-500/10"
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isZero
              ? "bg-destructive/20 text-destructive"
              : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          )}
        >
          {isZero ? (
            <AlertCircle className="h-4.5 w-4.5" />
          ) : (
            <AlertTriangle className="h-4.5 w-4.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-display font-semibold",
              isZero
                ? "text-destructive"
                : "text-amber-700 dark:text-amber-300"
            )}
          >
            {isZero
              ? "Você não tem mais licenças disponíveis"
              : `Apenas ${packCredits} licenç${packCredits === 1 ? "a" : "as"} restante${packCredits === 1 ? "" : "s"}`}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isZero
              ? "Compre um novo pacote para continuar gerando chaves."
              : "Suas licenças estão acabando. Compre um novo pacote antes que elas terminem."}
          </p>
          <Link
            to="/painel/revendedor/comprar-pacote"
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              isZero
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-amber-500 text-white hover:bg-amber-600"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Comprar pacote
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
