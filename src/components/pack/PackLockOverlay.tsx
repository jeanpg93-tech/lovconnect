import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Sparkles, LogOut, RefreshCw, ShoppingCart } from "lucide-react";
import { LovMainLogo } from "@/components/LovMainLogo";

export function PackLockOverlay() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  // realtime: ao receber crédito, recarrega
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`pack-lock-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_pack_balances" }, () => {
        window.location.reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background/70 backdrop-blur-xl">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl">
          <div className="mb-6 flex justify-center">
            <LovMainLogo size="h-20 sm:h-28" />
          </div>
          <div className="rounded-2xl border border-primary/30 bg-card/80 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="text-center">
              <Badge className="mb-3 bg-primary/15 text-primary border-primary/30">
                <Sparkles className="h-3 w-3 mr-1" /> Modo Pack
              </Badge>
              <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tighter">
                Seus <span className="text-primary italic">créditos acabaram</span>
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Para continuar gerando chaves, compre um novo pacote de créditos.
                O painel é liberado automaticamente assim que o pagamento for confirmado.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-background/40 p-5">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <div className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground">Créditos restantes</div>
                <div className="font-mono font-black text-3xl text-primary">0</div>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate("/painel/revendedor/comprar-pacote")}
            >
              <ShoppingCart className="h-4 w-4 mr-2" /> Comprar pacote agora
            </Button>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={refreshing} onClick={async () => {
                setRefreshing(true);
                window.location.reload();
              }} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="w-full sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}