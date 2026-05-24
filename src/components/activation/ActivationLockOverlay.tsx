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
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none sm:rounded-2xl">
          <div className="mb-3 flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-background/80 text-primary backdrop-blur">
              <Lock className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> ver detalhes da ativação
            </Button>
          </div>
          <ActivationWelcome embedded />
        </DialogContent>
      </Dialog>
    </>
  );
}