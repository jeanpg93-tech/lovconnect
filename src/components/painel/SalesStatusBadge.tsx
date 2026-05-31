import { cn } from "@/lib/utils";

type Variant = "active" | "manager_disabled" | "pack_empty" | "subscription_overdue";

const COPY: Record<Variant, { color: "green" | "red"; title: string; subtitle?: string }> = {
  active: {
    color: "green",
    title: "Sistema on-line",
    subtitle: "Vendas liberadas",
  },
  manager_disabled: {
    color: "red",
    title: "Vendas suspensas pelo gerente",
    subtitle: "Entre em contato para mais informações.",
  },
  pack_empty: {
    color: "red",
    title: "Suas licenças acabaram",
    subtitle: "Compre um novo pacote para continuar vendendo.",
  },
  subscription_overdue: {
    color: "red",
    title: "Cobrança em aberto",
    subtitle: "Regularize o pagamento para liberar as vendas.",
  },
};

export function SalesStatusBadge({
  variant,
  className,
}: {
  variant: Variant;
  className?: string;
}) {
  const { color, title, subtitle } = COPY[variant];
  const isGreen = color === "green";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        isGreen
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-rose-500/30 bg-rose-500/5",
        className,
      )}
    >
      <span className="relative flex h-3 w-3 shrink-0">
        {isGreen && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-3 w-3 rounded-full",
            isGreen ? "bg-emerald-500" : "bg-rose-500",
          )}
        />
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-bold leading-tight",
            isGreen ? "text-emerald-500" : "text-rose-500",
          )}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground leading-tight mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export default SalesStatusBadge;