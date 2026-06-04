import { useEffect, useMemo, useState } from "react";
// @ts-expect-error - react-joyride v3 has no bundled types
import { Joyride, STATUS, EVENTS, ACTIONS } from "react-joyride";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Rocket, SkipForward } from "lucide-react";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";

type TourStep = {
  target: string;
  title: string;
  content: string;
  route?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center" | "auto";
  disableBeacon?: boolean;
};

const STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard-saldo"]',
    title: "Seu saldo na plataforma",
    content: "Aqui você acompanha quanto tem disponível. Use o botão Adicionar saldo sempre que precisar recarregar.",
    route: "/painel/revendedor",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="menu-gerar-chave"]',
    title: "Gerar chave",
    content: "Crie a licença/extensão para o seu cliente em segundos. É aqui que sua venda começa.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-minhas-chaves"]',
    title: "Minhas chaves & clientes",
    content: "Acompanhe todas as chaves geradas, status de uso e quem está ativo.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-carteira"]',
    title: "Carteira & recargas",
    content: "Adicione saldo via PIX para continuar gerando chaves automaticamente.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-loja"]',
    title: "Sua loja pública",
    content: "Compartilhe um link e venda no automático 24h, com pagamento via PIX.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-precos"]',
    title: "Precificação",
    content: "Defina aqui o preço de venda dos seus produtos para cada método.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-indicacoes"]',
    title: "Indique e ganhe",
    content: "Convide outros revendedores e ganhe comissão recorrente sobre as recargas deles.",
    placement: "right",
  },
  {
    target: '[data-tour="menu-extensao"]',
    title: "Extensão & APIs",
    content: "Baixe a extensão personalizada e veja como integrar via API quando precisar.",
    placement: "right",
  },
];

export function OnboardingTour() {
  const { shouldShow, running, start, stop, markCompleted, markSkipped } = useOnboardingTour();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Abre o modal de boas-vindas quando o tour está disponível e ainda não rodando
  useEffect(() => {
    if (shouldShow && !running) setShowWelcome(true);
    else setShowWelcome(false);
  }, [shouldShow, running]);

  // Garante que estamos no dashboard antes de iniciar
  const beginTour = () => {
    setShowWelcome(false);
    setStepIndex(0);
    if (pathname !== "/painel/revendedor") navigate("/painel/revendedor");
    setTimeout(() => start(), 300);
  };

  const skipNow = async () => {
    setShowWelcome(false);
    await markSkipped();
  };

  const steps = useMemo<TourStep[]>(() => STEPS, []);

  const handleCallback = (data: any) => {
    const { status, type, index, action } = data;
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const next = index + (action === ACTIONS.PREV ? -1 : 1);
      // pula passos cujo alvo não existe
      if (next >= 0 && next < steps.length) setStepIndex(next);
      else if (next >= steps.length) {
        stop();
        setShowFinish(true);
      }
    }
    if (status === STATUS.SKIPPED) {
      stop();
      markSkipped();
    }
    if (status === STATUS.FINISHED) {
      stop();
      setShowFinish(true);
    }
  };

  const finishAndClose = async () => {
    setShowFinish(false);
    await markCompleted();
  };

  if (!shouldShow && !running && !showFinish) return null;

  return (
    <>
      {/* Modal de boas-vindas */}
      <Dialog open={showWelcome} onOpenChange={(o) => !o && skipNow()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center font-display text-xl">Tudo pronto! 🎉</DialogTitle>
            <DialogDescription className="text-center">
              Seu acesso foi liberado. Quer um tour rápido (≈ 1 min) pelos principais recursos do painel?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="ghost" onClick={skipNow} className="w-full sm:w-auto">
              <SkipForward className="mr-2 h-4 w-4" /> Pular
            </Button>
            <Button onClick={beginTour} className="w-full sm:w-auto">
              <Rocket className="mr-2 h-4 w-4" /> Começar tour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tour overlay */}
      <Joyride
        steps={steps}
        stepIndex={stepIndex}
        run={running}
        continuous
        showSkipButton
        showProgress
        scrollToFirstStep
        disableScrollParentFix
        callback={handleCallback}
        locale={{ back: "Anterior", close: "Fechar", last: "Concluir", next: "Próximo", skip: "Pular tour" }}
        styles={{
          options: {
            arrowColor: "hsl(var(--card))",
            backgroundColor: "hsl(var(--card))",
            primaryColor: "hsl(var(--primary))",
            textColor: "hsl(var(--foreground))",
            overlayColor: "rgba(0,0,0,0.55)",
            zIndex: 9999,
          },
          tooltip: { borderRadius: 12, padding: 16 },
          tooltipTitle: { fontWeight: 700, fontSize: 14 },
          tooltipContent: { fontSize: 13, lineHeight: 1.5 },
          buttonNext: { borderRadius: 8, fontSize: 12, fontWeight: 600 },
          buttonBack: { color: "hsl(var(--muted-foreground))", fontSize: 12 },
          buttonSkip: { color: "hsl(var(--muted-foreground))", fontSize: 12 },
        }}
      />

      {/* Modal final */}
      <Dialog open={showFinish} onOpenChange={(o) => !o && finishAndClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10">
              <Rocket className="h-6 w-6 text-emerald-500" />
            </div>
            <DialogTitle className="text-center font-display text-xl">Tudo pronto, bom faturamento! 🚀</DialogTitle>
            <DialogDescription className="text-center">
              Você já viu o essencial. Para refazer este tour depois, vá em <strong>Ajustes da conta</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={() => { finishAndClose(); navigate("/painel/revendedor/carteira"); }}>
              Comprar saldo
            </Button>
            <Button variant="outline" onClick={() => { finishAndClose(); navigate("/painel/revendedor/indicacoes"); }}>
              Indique e ganhe
            </Button>
            <Button onClick={finishAndClose}>
              Ir para o painel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}