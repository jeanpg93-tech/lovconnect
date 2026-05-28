import { Sparkles, Gift } from "lucide-react";
import { usePromotion } from "@/hooks/usePromotions";
import { cn } from "@/lib/utils";

const fmtBRL = (cents: number) =>
  (Math.abs(Number(cents || 0)) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

type Props = {
  promotionId?: string | null;
  amountCents?: number | null;
  /** "discount" subtrai do preço (vendas). "bonus" adiciona (recargas). */
  variant?: "discount" | "bonus";
  className?: string;
  /** Esconde o valor monetário quando não relevante. */
  hideAmount?: boolean;
};

/**
 * Badge minúscula que aparece ao lado de vendas/recargas que tiveram
 * promoção aplicada. Se `promotionId` não existir, não renderiza nada.
 */
export function PromotionAppliedBadge({
  promotionId,
  amountCents,
  variant = "discount",
  className,
  hideAmount,
}: Props) {
  const promo = usePromotion(promotionId);
  if (!promotionId) return null;

  const name = promo?.name ?? "Promoção";
  const isBonus = variant === "bonus";
  const Icon = isBonus ? Gift : Sparkles;
  const sign = isBonus ? "+" : "−";
  const colors = isBonus
    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30";

  const showAmount = !hideAmount && !!amountCents && Math.abs(amountCents) > 0;

  return (
    <span
      title={`${isBonus ? "Bônus" : "Desconto"} aplicado pela promoção "${name}"`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider font-mono whitespace-nowrap",
        colors,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      <span className="truncate max-w-[120px]">{name}</span>
      {showAmount && (
        <span className="opacity-90">
          {sign}
          {fmtBRL(amountCents!)}
        </span>
      )}
    </span>
  );
}