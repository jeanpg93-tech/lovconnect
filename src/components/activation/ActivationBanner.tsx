import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, ShieldAlert } from "lucide-react";
import { ActivationWelcome } from "./ActivationWelcome";
import type { ActivationStatus } from "@/hooks/useActivation";
import { useActivationPricing, formatBRL } from "@/hooks/useActivationPricing";

interface Props {
  status: ActivationStatus;
}

export function ActivationBanner({ status }: Props) {
  const [open, setOpen] = useState(false);
  const pricing = useActivationPricing();
  const finalLabel = pricing ? formatBRL(pricing.finalPriceCents) : "R$ 200";
  const baseLabel = pricing ? formatBRL(pricing.basePriceCents) : "R$ 200";
  const promoTitle = pricing?.hasDiscount
    ? `Promo: ative por ${finalLabel} (de ${baseLabel})`
    : `Ative seu painel de revendedor — ${finalLabel}`;

  const config =
    status === "payment_under_review"
      ? {
          icon: Clock,
          tone: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
          dot: "bg-yellow-400",
          title: "Comprovante em análise",
          desc: "Seu acesso completo será liberado assim que o pagamento for confirmado.",
          cta: "ver status",
        }
      : status === "payment_rejected"
        ? {
            icon: ShieldAlert,
            tone: "border-destructive/40 bg-destructive/10 text-destructive-foreground",
            dot: "bg-destructive",
            title: "Comprovante recusado",
            desc: "Envie um novo comprovante ou gere um novo PIX para liberar seu painel.",
            cta: "reenviar",
          }
        : {
            icon: Sparkles,
            tone: "border-primary/40 bg-primary/10 text-primary-foreground",
            dot: "bg-primary",
            title: promoTitle,
            desc: "Você está em modo prévia. Conclua o pagamento para liberar 100% das funcionalidades.",
            cta: "ativar agora",
          };

  const Icon = config.icon;

  return (
    <>
      <div className={`mb-4 flex flex-col items-start gap-3 rounded-xl border ${config.tone} p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4`}>
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.dot} opacity-60`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.dot}`} />
          </span>
          <Icon className="h-5 w-5 shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold uppercase tracking-wide">{config.title}</div>
          <p className="mt-0.5 text-xs opacity-90">{config.desc}</p>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {config.cta}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none sm:rounded-2xl">
          <ActivationWelcome embedded />
        </DialogContent>
      </Dialog>
    </>
  );
}