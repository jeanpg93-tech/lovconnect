import { Navigate } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";

const LoadingRedirect = () => (
  <div className="flex min-h-[60vh] items-center justify-center bg-background text-foreground">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

export default function PainelRedirect() {
  const { primaryRole, loading, hasData } = useRole();
  
  // Nunca renderiza vazio: em mobile isso parecia uma tela branca enquanto a role carregava.
  if (loading && !hasData) return <LoadingRedirect />;

  if (primaryRole === "gerente") return <Navigate to="/painel/gerente" replace />;
  if (primaryRole === "revendedor") return <Navigate to="/painel/revendedor" replace />;
  if (primaryRole === "cliente") return <Navigate to="/painel/cliente" replace />;
  
  // Se não tiver role, espera ou vai para auth
  if (hasData && !primaryRole) return <Navigate to="/auth" replace />;
  
  return <LoadingRedirect />;
}
