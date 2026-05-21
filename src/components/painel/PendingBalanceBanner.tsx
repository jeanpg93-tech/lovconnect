import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingStorefrontCharges } from "@/hooks/usePendingStorefrontCharges";

export function PendingBalanceBanner() {
  const { count, hasPending } = usePendingStorefrontCharges();
  if (!hasPending) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {count} venda{count > 1 ? "s" : ""} da loja aguardando saldo.
        </span>{" "}
        <span className="text-muted-foreground">
          Recarregue para liberar a entrega aos compradores.
        </span>
      </div>
      <Link
        to="/painel/revendedor/adicionar-saldo"
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
      >
        Adicionar saldo <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}