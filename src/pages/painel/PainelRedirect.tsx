import { Navigate } from "react-router-dom";
import { useRole } from "@/hooks/useRole";

export default function PainelRedirect() {
  const { primaryRole, loading, hasData } = useRole();
  
  // Se estiver carregando pela primeira vez, não redireciona para evitar loop
  if (loading && !hasData) return null;

  if (primaryRole === "gerente") return <Navigate to="/painel/gerente" replace />;
  if (primaryRole === "revendedor") return <Navigate to="/painel/revendedor" replace />;
  if (primaryRole === "cliente") return <Navigate to="/painel/cliente" replace />;
  
  // Se não tiver role, espera ou vai para auth
  if (hasData && !primaryRole) return <Navigate to="/auth" replace />;
  
  return null;
}
