import { Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";
import { PanelRoutes } from "./PanelRoutes";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { MobileNav } from "./MobileNav";
import { PendingBalanceBanner } from "@/components/painel/PendingBalanceBanner";
import { LovMainLogo } from "@/components/LovMainLogo";
import { Button } from "@/components/ui/button";
import { Clock, ShieldCheck, Sparkles, LogOut, MessageCircle } from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { PendingProfileGate } from "@/components/PendingProfileGate";
import { ActivationBanner } from "@/components/activation/ActivationBanner";
import { ActivationLockOverlay } from "@/components/activation/ActivationLockOverlay";
import { useActivation } from "@/hooks/useActivation";

export default function AppLayout() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { primaryRole, isBanned, isActive, isGerente, loading: roleLoading, hasData } = useRole();
  const isInitialAuthLoading = authLoading && !user;
  const isInitialRoleLoading = roleLoading && !hasData;
  useRealtimeNotifications();
  const { status: activationStatus, loading: activationLoading } = useActivation(
    user && primaryRole === "revendedor" ? user.id : undefined,
  );

  // Se estiver banido, redireciona (exceto se for gerente)
  if (user && isBanned && !isGerente) {
    return <Navigate to="/banned" replace />;
  }

  // Se for revendedor e estiver inativo, redireciona
  if (user && primaryRole === "revendedor" && !isActive) {
    return <Navigate to="/inactive" replace />;
  }

  // We only show the full-screen loader on the VERY FIRST load.
  // After that, we keep the UI and only update in the background to avoid flicker.
  if (isInitialAuthLoading || (isInitialRoleLoading && !hasData)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const needsActivation =
    primaryRole === "revendedor" &&
    !activationLoading &&
    activationStatus &&
    activationStatus !== "active";

  if (!primaryRole) {
    return (
      <PendingProfileGate userId={user.id}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-30" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10 w-full max-w-xl">
          <div className="mb-6 flex justify-center sm:mb-8">
            <LovMainLogo size="h-28 sm:h-36" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/60 p-5 text-center shadow-2xl backdrop-blur-sm sm:p-10">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-red-glow-sm sm:h-14 sm:w-14">
              <Clock className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3 w-3" />
              cadastro recebido
            </span>
            <h1 className="mt-5 font-display text-xl font-bold uppercase tracking-tight sm:text-3xl">
              Bem-vindo à <span className="text-primary">LovConnect</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Seu cadastro foi recebido com sucesso e está em análise pela nossa equipe.
              Em instantes você terá acesso completo ao painel do revendedor, com todas as
              ferramentas para começar a vender e gerar receita recorrente.
            </p>

            <div className="mt-6 grid gap-3 text-left sm:mt-8 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3 sm:p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider">Aprovação manual</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Validamos cada cadastro para manter a rede segura e confiável.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3 sm:p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider">Liberação rápida</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Assim que liberado, seu painel aparece automaticamente nesta tela.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:mt-8 sm:flex-row sm:gap-3">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => window.location.reload()}
              >
                <Clock className="mr-2 h-4 w-4" /> verificar novamente
              </Button>
              <Button
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" /> sair
              </Button>
            </div>

            <p className="mt-6 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
              <MessageCircle className="h-3 w-3" />
              dúvidas? fale com quem te indicou
            </p>
          </div>
        </div>
      </div>
      </PendingProfileGate>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 pb-28 md:pb-0">
          <main className="relative flex-1 p-4 sm:p-6 min-w-0 overflow-x-hidden pt-[calc(env(safe-area-inset-top)+4.5rem)] md:!pt-6">
            <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-40" />
            <div className="relative">
              {needsActivation && <ActivationBanner status={activationStatus!} />}
              {primaryRole === "revendedor" && <PendingBalanceBanner />}
              <div className="relative">
                <div
                  className={needsActivation ? "pointer-events-none select-none" : undefined}
                  aria-hidden={needsActivation || undefined}
                  inert={needsActivation ? "" : undefined as any}
                >
                  <PanelRoutes />
                </div>
                {needsActivation && <ActivationLockOverlay status={activationStatus!} />}
              </div>
            </div>
          </main>
        </div>
        <MobileNav />
          <NotificationCenter />
      </div>
    </SidebarProvider>
  );
}
