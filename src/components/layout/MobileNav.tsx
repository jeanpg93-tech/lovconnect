import { Home, Wallet, KeyRound, Coins, ArrowRightLeft, Plus, History, LayoutDashboard, CreditCard, Menu, LogOut, Sparkles, Zap } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSidebar } from "@/components/ui/sidebar";
export function MobileNav() {
  const { pathname } = useLocation();
  const { primaryRole } = useRole();
  const { user, signOut } = useAuth();
  const { setOpenMobile } = useSidebar();
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [resellerBalance, setResellerBalance] = useState<number | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle();
      if (cancelled || !data) return;
      const name = data.display_name?.trim() || data.email?.split("@")[0] || "";
      setUserName(name);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { text: "Bom dia", emoji: "☀️" };
    if (hour >= 12 && hour < 18) return { text: "Boa tarde", emoji: "🌤️" };
    return { text: "Boa noite", emoji: "🌙" };
  })();

  useEffect(() => {
    if (primaryRole !== "revendedor" || !user?.id) return;
    
    const load = async () => {
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) return;
      const { data: b } = await supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle();
      if (b) setResellerBalance(b.balance_cents);
    };

    load();
    const ch = supabase.channel(`mobile-nav-balance-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_balances" }, load)
      .subscribe();
      
    return () => { supabase.removeChannel(ch); };
  }, [primaryRole, user?.id]);

  const formatBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const getHomeUrl = () => {
    if (primaryRole === "gerente") return "/painel/gerente";
    if (primaryRole === "revendedor") return "/painel/revendedor";
    return "/painel/cliente";
  };

  const navItems = [
    {
      label: "Início",
      icon: LayoutDashboard,
      url: getHomeUrl(),
      active: pathname === getHomeUrl(),
    },
    {
      label: "Recargas",
      icon: Zap,
      url: "/painel/revendedor/recargas",
      active: pathname === "/painel/revendedor/recargas",
    },
    {
      label: "Novo",
      icon: Plus,
      onClick: () => setIsCartModalOpen(true),
      isAction: true,
    },
    {
      label: "Licenças",
      icon: KeyRound,
      url: primaryRole === "gerente" ? "/painel/gerente/licencas" : "/painel/revendedor/licencas",
      active: pathname === (primaryRole === "gerente" ? "/painel/gerente/licencas" : "/painel/revendedor/licencas"),
    },
    {
      label: "Saldo",
      icon: Wallet,
      onClick: () => setIsWalletModalOpen(true),
      active: isWalletModalOpen,
    },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div
        className="fixed top-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="flex h-14 items-center justify-between px-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-accent shrink-0"
            onClick={() => setOpenMobile(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <span className="flex-1 min-w-0 text-center text-[12px] font-semibold tracking-tight text-foreground truncate px-2">
            {greeting.text}, {(userName || "...").split(" ")[0]} {greeting.emoji}
          </span>

          <div className="flex items-center gap-0.5 shrink-0">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={signOut}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="relative">
          {/* Main Bar */}
          <nav className="flex h-[72px] w-full items-center justify-between px-4 pb-[env(safe-area-inset-bottom)] bg-background/95 backdrop-blur-xl border-t border-border">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              
              if (item.isAction) {
                return (
                  <button
                    key={idx}
                    onClick={item.onClick}
                    className="relative -mt-10 flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/0.4)] transition-transform active:scale-90">
                      <Icon className="h-6 w-6 stroke-[2.5px]" />
                    </div>
                    <span className="text-[11px] font-bold tracking-tight text-foreground">{item.label}</span>
                  </button>
                );
              }

              if (item.url) {
                return (
                  <Link
                    key={idx}
                    to={item.url}
                    className={cn(
                      "flex flex-col items-center gap-1 transition-all duration-300",
                      item.active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                      item.active ? "bg-accent" : ""
                    )}>
                      <Icon className={cn("h-5 w-5", item.active ? "stroke-[2.2px]" : "stroke-[1.8px]")} />
                    </div>
                    <span className="text-[10px] font-semibold">{item.label}</span>
                  </Link>
                );
              }

              return (
                <button
                  key={idx}
                  onClick={item.onClick}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all duration-300",
                    item.active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                    item.active ? "bg-accent" : ""
                  )}>
                    <Icon className={cn("h-5 w-5", item.active ? "stroke-[2.2px]" : "stroke-[1.8px]")} />
                  </div>
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <Dialog open={isCartModalOpen} onOpenChange={setIsCartModalOpen}>
        <DialogContent className="border-none bg-[#09090b]/95 backdrop-blur-2xl p-0 overflow-hidden rounded-[2.5rem] mx-4 max-w-[calc(100%-2rem)] shadow-2xl ring-1 ring-white/10">
          <div className="p-8">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-3xl font-black tracking-tight text-white">Novo</DialogTitle>
              <DialogDescription className="text-zinc-500 font-medium">
                Escolha o que deseja gerar.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Button
                variant="ghost"
                className="group relative h-24 w-full bg-zinc-900/40 border border-white/5 p-0 overflow-hidden rounded-[2rem] transition-all hover:bg-zinc-800/60 active:scale-[0.98]"
                asChild
              >
                <Link
                  to={primaryRole === "gerente" ? "/painel/gerente/geracao-manual-creditos" : "/painel/revendedor/licencas"}
                  onClick={() => setIsCartModalOpen(false)}
                  className="flex items-center px-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-black group-hover:scale-110 transition-transform">
                    <Coins className="h-6 w-6" />
                  </div>
                  <div className="ml-4 text-left">
                    <span className="block text-xl font-bold text-white tracking-tight">Nova Recargas</span>
                    <span className="block text-xs font-medium text-zinc-500 uppercase tracking-widest">Recargas de acesso</span>
                  </div>
                </Link>
              </Button>
              
              <Button
                variant="ghost"
                className="group relative h-24 w-full bg-zinc-900/40 border border-white/5 p-0 overflow-hidden rounded-[2rem] transition-all hover:bg-zinc-800/60 active:scale-[0.98]"
                asChild
              >
                <Link
                  to={primaryRole === "gerente" ? "/painel/gerente/geracao-manual" : "/painel/revendedor/licencas"}
                  onClick={() => setIsCartModalOpen(false)}
                  className="flex items-center px-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-black group-hover:scale-110 transition-transform">
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <div className="ml-4 text-left">
                    <span className="block text-xl font-bold text-white tracking-tight">Nova Chave</span>
                    <span className="block text-xs font-medium text-zinc-500 uppercase tracking-widest">Licença Individual</span>
                  </div>
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent className="border-none bg-[#09090b]/95 backdrop-blur-3xl p-0 overflow-hidden rounded-[2.5rem] mx-4 max-w-[calc(100%-2rem)] shadow-2xl ring-1 ring-white/10">
          <div className="p-8">
            <DialogHeader className="mb-6 text-left">
              <DialogTitle className="text-3xl font-black tracking-tight text-white">Carteira</DialogTitle>
              <DialogDescription className="text-zinc-500 font-medium">Controle seu saldo e transações.</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-zinc-100 to-zinc-400 p-8 text-black shadow-xl">
                <div className="relative z-10">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">Saldo em Conta</span>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tighter">
                      {primaryRole === "revendedor" ? formatBRL(resellerBalance || 0) : "R$ 0,00"}
                    </span>
                  </div>
                </div>
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
                <Wallet className="absolute right-6 bottom-6 h-12 w-12 opacity-10 rotate-12" />
              </div>

              <div className="grid gap-3">
                <Button
                  variant="ghost"
                  className="h-16 w-full justify-between rounded-2xl bg-zinc-900/40 border border-white/5 px-6 hover:bg-zinc-800/60 transition-all"
                  asChild
                >
                  <Link
                    to={primaryRole === "gerente" ? "/painel/gerente/financeiro" : "/painel/revendedor/transacoes"}
                    onClick={() => setIsWalletModalOpen(false)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
                        <History className="h-5 w-5" />
                      </div>
                      <span className="font-bold text-white tracking-tight">Transações</span>
                    </div>
                    <ArrowRightLeft className="h-4 w-4 text-zinc-600" />
                  </Link>
                </Button>

                {primaryRole === "revendedor" && (
                  <Button
                    className="h-16 w-full rounded-2xl bg-white text-black font-black text-base shadow-lg hover:bg-zinc-200 transition-all active:scale-[0.98]"
                    asChild
                  >
                    <Link
                      to="/painel/revendedor/carteira#saldo"
                      onClick={() => setIsWalletModalOpen(false)}
                    >
                      <Plus className="mr-2 h-5 w-5 stroke-[3px]" />
                      Adicionar Saldo
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
