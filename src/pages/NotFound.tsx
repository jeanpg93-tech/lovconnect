import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, RefreshCw } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    const t = setTimeout(() => navigate("/", { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [location.pathname, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-6xl font-black tracking-tight text-primary">404</h1>
        <p className="mb-2 text-lg font-semibold">Página não encontrada</p>
        <p className="mb-6 text-sm text-muted-foreground">
          Rota inválida: <code className="text-foreground">{location.pathname}</code>.
          Você será redirecionado em instantes.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate("/", { replace: true })} className="gap-2">
            <Home className="h-4 w-4" /> Ir para o início
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Recarregar
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
