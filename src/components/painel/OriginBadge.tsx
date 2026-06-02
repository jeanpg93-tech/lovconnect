import { Package, Wallet, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrderOrigin = "pack" | "wallet" | "wallet_fallback" | "unknown";

/**
 * Lê o JSON em orders.notes e devolve a origem da entrega da licença.
 * 'pack' = saiu do pacote · 'wallet_fallback' = pacote esgotado, debitou do saldo
 * 'wallet' = modo carteira normal · 'unknown' = sem registro
 */
export function readOriginFromNotes(notes: string | null | undefined): OrderOrigin {
  if (!notes) return "unknown";
  try {
    const o = JSON.parse(notes);
    const ds = o?.delivery_source;
    if (ds === "pack") return "pack";
    if (ds === "wallet_fallback") return "wallet_fallback";
    if (ds === "wallet") return "wallet";
    if (o?.fallback_from_pack === true) return "wallet_fallback";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Deriva a origem a partir das colunas delivery_source/fallback_from_pack
 * presentes em storefront_orders (após a migration de Phase 3).
 */
export function readOriginFromRow(row: {
  delivery_source?: string | null;
  fallback_from_pack?: boolean | null;
}): OrderOrigin {
  const ds = row?.delivery_source;
  if (ds === "pack") return "pack";
  if (ds === "wallet_fallback") return "wallet_fallback";
  if (ds === "wallet") return "wallet";
  if (row?.fallback_from_pack === true) return "wallet_fallback";
  return "unknown";
}

const CONFIG: Record<Exclude<OrderOrigin, "unknown">, { label: string; short: string; Icon: typeof Package; cls: string; title: string }> = {
  pack: {
    label: "Vendas - Packs",
    short: "Packs",
    Icon: Package,
    cls: "border-primary/30 bg-primary/10 text-primary",
    title: "Licença debitada dos seus Packs",
  },
  wallet: {
    label: "Saldo",
    short: "Saldo",
    Icon: Wallet,
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    title: "Licença debitada do saldo da carteira",
  },
  wallet_fallback: {
    label: "Saldo (fallback)",
    short: "Fallback",
    Icon: AlertTriangle,
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    title: "Packs esgotados: licença foi paga com saldo da carteira automaticamente",
  },
};

export default function OriginBadge({
  origin,
  size = "sm",
  iconOnly = false,
}: {
  origin: OrderOrigin;
  size?: "xs" | "sm";
  iconOnly?: boolean;
}) {
  if (origin === "unknown") return null;
  const c = CONFIG[origin];
  const Icon = c.Icon;
  return (
    <span
      title={c.title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold",
        c.cls,
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
      )}
    >
      <Icon className="h-3 w-3" />
      {!iconOnly && <span>{c.short}</span>}
    </span>
  );
}