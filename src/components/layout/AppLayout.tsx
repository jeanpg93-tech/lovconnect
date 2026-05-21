import { Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";
import { PanelRoutes } from "./PanelRoutes";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { MobileNav } from "./MobileNav";

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { primaryRole, isBanned, isActive, isGerente, loading: roleLoading, hasData } = useRole();
  const isInitialAuthLoading = authLoading && !user;
  const isInitialRoleLoading = roleLoading && !hasData;
  useRealtimeNotifications();

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
  if (!primaryRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-xl font-bold">Conta sem papel atribuído</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ainda não tem nenhum papel ativo. Contate o gerente do sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0 pb-28 md:pb-0">
          <main className="relative flex-1 p-4 sm:p-6 min-w-0 overflow-x-hidden pt-20 md:pt-6">
            <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-40" />
            <div className="relative">
              <PanelRoutes />
            </div>
          </main>
        </div>
        <MobileNav />
      </div>
    </SidebarProvider>
  );
}
