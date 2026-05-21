import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useRole, AppRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";

export const RoleRoute = ({
  allow,
  children,
}: {
  allow: AppRole[];
  children: ReactNode;
}) => {
  const { roles, primaryRole, loading, hasData } = useRole();

  // Com KeepAlive, nunca queremos desmontar o RoleRoute se ele já tem dados.
  // Apenas renderizamos o conteúdo. O redirecionamento acontece apenas se
  // a verificação terminar e o acesso for realmente negado.
  if (loading && !hasData) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allowed = roles.some((r) => allow.includes(r));
  
  // Só redireciona se tivermos certeza dos dados (hasData) e o usuário REALMENTE não tiver permissão.
  // Se estiver em loading, mantemos o que estiver na tela para evitar saltos.
  if (!loading && hasData && !allowed) {
    if (primaryRole === "gerente") return <Navigate to="/painel/gerente" replace />;
    if (primaryRole === "revendedor") return <Navigate to="/painel/revendedor" replace />;
    if (primaryRole === "cliente") return <Navigate to="/painel/cliente" replace />;
    // Fallback caso primaryRole seja null por algum motivo bizarro
    return <Navigate to="/auth" replace />;
  }

  // If loading in background, keep rendering the children (previous state)
  return <>{children}</>;
};
