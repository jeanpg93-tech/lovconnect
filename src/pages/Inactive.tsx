import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PowerOff, LogOut, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function InactivePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    localStorage.removeItem("user_is_banned");
    localStorage.removeItem("user_is_active");
    localStorage.removeItem("app_roles_cache");
    await signOut();
    navigate("/auth", { replace: true });
  };

  // Verifica em tempo real se a conta foi reativada
  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from("resellers")
        .select("is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data && data.is_active) {
        localStorage.setItem("user_is_active", "true");
        navigate("/painel", { replace: true });
      }
    };
    check();

    const interval = setInterval(check, 5000);

    const channel = supabase
      .channel(`reseller-active-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "resellers", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new && payload.new.is_active) {
            localStorage.setItem("user_is_active", "true");
            navigate("/painel", { replace: true });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center animate-in fade-in duration-700">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-500 shadow-glow-sm">
        <PowerOff className="h-10 w-10" />
      </div>
      
      <h1 className="font-display text-4xl font-black uppercase tracking-tighter sm:text-5xl">
        Conta <span className="text-amber-500 italic">Inativa</span>
      </h1>
      
      <p className="mt-4 max-w-md text-muted-foreground font-medium leading-relaxed">
        Sua conta de revendedor está temporariamente desativada pelo administrador. 
        Isso pode ocorrer devido a manutenção, falta de saldo ou revisão de cadastro.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button 
          className="h-12 px-8 font-bold uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 shadow-glow-sm"
          onClick={() => window.open('https://discord.com/invite/ts6HQFy7y5', '_blank')}
        >
          <MessageSquare className="mr-2 h-4 w-4" /> Suporte Gerente
        </Button>
        <Button 
          variant="outline" 
          className="h-12 px-8 font-bold uppercase tracking-widest border-white/10 hover:bg-white/5"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
      
      <div className="mt-20 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/30">
        Account Status: Suspended
      </div>
    </div>
  );
}
