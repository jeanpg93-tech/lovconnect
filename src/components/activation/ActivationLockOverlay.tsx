import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { ActivationWelcome } from "./ActivationWelcome";
import type { ActivationStatus } from "@/hooks/useActivation";

interface Props {
  status: ActivationStatus;
}

/**
 * Overlay transparente que cobre a área de conteúdo do painel para
 * revendedores ainda não ativados. Permite VER tudo (o conteúdo é
 * renderizado normalmente atrás), mas bloqueia qualquer interação
 * (cliques, foco, scroll por toque) — abrindo um modal de ativação
 * sempre que o usuário tentar agir. A sidebar / navegação continua
 * funcionando porque está fora deste overlay.
 */
export function ActivationLockOverlay({ status }: Props) {
  const [open, setOpen] = useState(false);

  const subtitle =
    status === "payment_under_review"
      ? "Seu comprovante está em análise. Assim que confirmado, todas as ações serão liberadas."
      : status === "payment_rejected"
        ? "Seu pagamento foi recusado. Reenvie o comprovante ou gere um novo PIX para liberar o painel."
        : "Você está em modo prévia. Conclua a ativação para liberar as funcionalidades do painel.";

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <div
        // Cobre apenas a área de conteúdo (irmão direto, posicionada absoluta)
        className="absolute inset-0 z-40 cursor-not-allowed"
        onClickCapture={stop}
        onMouseDownCapture={stop}
        onPointerDownCapture={stop}
        onKeyDownCapture={stop}
        onSubmitCapture={stop}
        onContextMenuCapture={stop}
        aria-label="Conteúdo bloqueado até a ativação"
      >
        {/* fundo levemente esmaecido só pra dar o sinal visual de bloqueio */}
        <div className="pointer-events-none absolute inset-0 bg-background/30 backdrop-blur-[1px]" />

        {/* badge flutuante de "modo prévia" */}
        <div className="pointer-events-none sticky top-3 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary shadow-lg backdrop-blur">
          <Lock className="h-3 w-3" />
          modo prévia — clique para ativar
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto border border-border/60 bg-background p-0 shadow-2xl sm:rounded-2xl">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </div>
            <p className="flex-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          </div>
          <ActivationWelcome embedded />
        </DialogContent>
      </Dialog>
    </>
  );
}