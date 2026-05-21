import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function BannedPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    localStorage.removeItem("user_is_banned");
    localStorage.removeItem("user_is_active");
    localStorage.removeItem("app_roles_cache");
    await signOut();
    navigate("/auth", { replace: true });
  };

  // Verifica em tempo real se o usuário continua banido
  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", user.id)
        .maybeSingle();
      if (data && !data.is_banned) {
        localStorage.setItem("user_is_banned", "false");
        navigate("/painel", { replace: true });
      }
    };
    check();

    // Polling a cada 5s
    const interval = setInterval(check, 5000);

    // Realtime: escuta mudanças no próprio profile
    const channel = supabase
      .channel(`profile-ban-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new && !payload.new.is_banned) {
            localStorage.setItem("user_is_banned", "false");
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
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-full bg-destructive/20 opacity-75" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10 text-destructive shadow-glow-lg">
          <ShieldAlert className="h-12 w-12" />
        </div>
      </div>
      
      <h1 className="font-display text-4xl font-black uppercase tracking-tighter sm:text-5xl">
        Conta <span className="text-destructive italic">Banida</span>
      </h1>
      
      <p className="mt-4 max-w-md text-muted-foreground font-medium leading-relaxed">
        Seu acesso foi permanentemente revogado por violação dos termos de uso ou políticas do sistema. 
        Esta ação é irreversível.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button 
          className="h-12 px-8 font-bold uppercase tracking-widest bg-destructive text-white hover:bg-destructive/90 shadow-glow-sm"
          onClick={() => window.open('https://discord.com/invite/ts6HQFy7y5', '_blank')}
        >
          <MessageSquare className="mr-2 h-4 w-4" /> Suporte Gerente
        </Button>
        <Button 
          variant="outline" 
          className="h-12 px-8 font-bold uppercase tracking-widest border-white/10 hover:bg-white/5"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair da conta
        </Button>
      </div>
      
      <div className="mt-20 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/30">
        System Lockdown Active
      </div>
    </div>
  );
}
