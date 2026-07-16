import { AlertOctagon } from "lucide-react";
import { useSystemMaintenance } from "@/hooks/useSystemMaintenance";

/**
 * Banner fixo mostrado ao revendedor quando o gerente ativa o
 * modo manutenção global do sistema. Toda emissão de venda/licença
 * fica pausada; consultas continuam liberadas.
 */
export function SystemMaintenanceBanner() {
  const { enabled, message } = useSystemMaintenance(true);
  if (!enabled) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/50 bg-red-500/10 p-4 shadow-[0_0_24px_-8px_hsl(0_84%_60%/0.5)]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-500">
        <AlertOctagon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-500 uppercase tracking-wider">
            Sistema em manutenção
          </span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {message}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Novas emissões de licenças, recargas e vendas estão pausadas.
          Consultas ao painel (saldo, licenças, clientes, histórico) seguem
          disponíveis normalmente.
        </p>
      </div>
    </div>
  );
}

export default SystemMaintenanceBanner;