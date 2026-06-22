import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { isChunkLoadError, requestFreshChunkReload } from "@/lib/chunk-recovery";

const Auth = lazy(() => lazyWithChunkRecovery(() => import("./pages/Auth.tsx")));
const ResetPassword = lazy(() => lazyWithChunkRecovery(() => import("./pages/ResetPassword.tsx")));
const NotFound = lazy(() => lazyWithChunkRecovery(() => import("./pages/NotFound.tsx")));
const AppLayout = lazy(() => lazyWithChunkRecovery(() => import("./components/layout/AppLayout")));
const PublicStorefront = lazy(() => lazyWithChunkRecovery(() => import("./pages/PublicStorefront")));
const PublicExtension = lazy(() => lazyWithChunkRecovery(() => import("./pages/PublicExtension")));
const PublicRecharge = lazy(() => lazyWithChunkRecovery(() => import("./pages/PublicRecharge")));
const PublicPlano = lazy(() => lazyWithChunkRecovery(() => import("./pages/PublicPlano")));
const Banned = lazy(() => lazyWithChunkRecovery(() => import("./pages/Banned")));
const Inactive = lazy(() => lazyWithChunkRecovery(() => import("./pages/Inactive")));
const Install = lazy(() => lazyWithChunkRecovery(() => import("./pages/Install")));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

const RouteFallback = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    </div>
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">Carregando</p>
      <p className="text-xs text-muted-foreground">Só um instante…</p>
    </div>
  </div>
);

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { chunkError: boolean }> {
  state = { chunkError: false };

  static getDerivedStateFromError(error: unknown) {
    return { chunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    if (isChunkLoadError(error)) requestFreshChunkReload();
  }

  render() {
    if (this.state.chunkError) return <RouteFallback />;
    return this.props.children;
  }
}

function lazyWithChunkRecovery<T extends { default: ComponentType<any> }>(loader: () => Promise<T>) {
  return loader().catch((error) => {
    if (isChunkLoadError(error)) requestFreshChunkReload();
    throw error;
  });
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ChunkErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/auth" replace />} />
                <Route path="/index" element={<Navigate to="/auth" replace />} />
                <Route path="/index.html" element={<Navigate to="/auth" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/banned" element={<Banned />} />
                <Route path="/inactive" element={<Inactive />} />
                <Route path="/instalar" element={<Install />} />
                <Route path="/painel/*" element={<AppLayout />} />
                <Route path="/loja/:slug" element={<PublicStorefront />} />
                <Route path="/Extension-flow" element={<PublicExtension slug="lovmain-unlimited" />} />
                <Route path="/Extension-lovax" element={<PublicExtension slug="extension-lovax" />} />
                <Route path="/recargas/:id" element={<PublicRecharge />} />
                <Route path="/plano/:token" element={<PublicPlano />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ChunkErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
