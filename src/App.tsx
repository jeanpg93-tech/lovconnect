import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const Auth = lazy(() => import("./pages/Auth.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const PublicStorefront = lazy(() => import("./pages/PublicStorefront"));
const PublicExtension = lazy(() => import("./pages/PublicExtension"));
const PublicRecharge = lazy(() => import("./pages/PublicRecharge"));
const Banned = lazy(() => import("./pages/Banned"));
const Inactive = lazy(() => import("./pages/Inactive"));
const Install = lazy(() => import("./pages/Install"));

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
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    Carregando…
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/banned" element={<Banned />} />
              <Route path="/inactive" element={<Inactive />} />
              <Route path="/instalar" element={<Install />} />
              <Route path="/painel/*" element={<AppLayout />} />
              <Route path="/loja/:slug" element={<PublicStorefront />} />
              <Route path="/extensao/:slug" element={<PublicExtension />} />
              <Route path="/recarga/:id" element={<PublicRecharge />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
