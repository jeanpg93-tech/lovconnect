import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ExternalLink,
  LayoutDashboard,
  Package,
  Users,
  Store,
  ShieldCheck,
  LogOut,
  Moon,
  Sun,
  CreditCard,
  KeyRound,
  AlertTriangle,
  Trash2,
  ChevronDown,
  Wallet,
  Ticket,
  ShoppingCart,
  Tag,
  Crown,
  MessageSquare,
  UserCog,
  Sparkles,
  UserCheck,
  Gift,
  Megaphone,
  Handshake,
  Trophy,
  Award,
  Palette,
  RotateCcw,
  History as HistoryIcon,
  ShoppingBag,
  Coins,
  BarChart3,
  Smartphone,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LovMainLogo } from "@/components/LovMainLogo";
import { useRole, AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

type Item = { title: string; url: string; icon: any; badge?: "store-status" };
type Group = { label: string; items: Item[] };

const groupsByRole: Record<AppRole, Group[]> = {
  gerente: [
    { label: "Visão geral", items: [
      { title: "Dashboard", url: "/painel/gerente", icon: LayoutDashboard },
      { title: "Financeiro", url: "/painel/gerente/financeiro", icon: Wallet },
      { title: "Vendas da Loja", url: "/painel/gerente/vendas-loja", icon: ShoppingBag },
    ]},
    { label: "Operação", items: [
      { title: "Aprovações", url: "/painel/gerente/aprovacoes", icon: UserCheck },
      { title: "Avisos", url: "/painel/gerente/avisos", icon: Megaphone },
      { title: "Ações Especiais", url: "/painel/gerente/acoes-especiais", icon: Sparkles },
    ]},
    { label: "Rede", items: [
      { title: "Revendedores", url: "/painel/gerente/revendedores", icon: Store },
      { title: "Níveis", url: "/painel/gerente/niveis", icon: Crown },
      { title: "Afiliados", url: "/painel/gerente/affiliados", icon: Ticket },
      { title: "Partners", url: "/painel/gerente/partners", icon: Handshake },
      { title: "Premiação Ranking", url: "/painel/gerente/ranking-prizes", icon: Gift },
    ]},
    { label: "Produtos", items: [
      { title: "Geração de Licenças", url: "/painel/gerente/geracao-manual", icon: Sparkles },
      { title: "Geração de Créditos", url: "/painel/gerente/geracao-manual-creditos", icon: Coins },
      { title: "Valores Extensões", url: "/painel/gerente/valores", icon: Tag },
      { title: "Todas as Licenças", url: "/painel/gerente/todas-licencas", icon: KeyRound },
      { title: "Upload Extensão", url: "/painel/gerente/upload-extensao", icon: Package },
    ]},
    { label: "Recargas", items: [
      { title: "Gerenciar Recargas", url: "/painel/gerente/recargas", icon: Coins },
    ]},
  ],
  revendedor: [
    { label: "Painel", items: [
      { title: "Dashboard", url: "/painel/revendedor", icon: LayoutDashboard },
      { title: "Recarga", url: "/painel/revendedor/recarga", icon: Zap },
      { title: "Transações", url: "/painel/revendedor/transacoes", icon: HistoryIcon },
      { title: "Indique e ganhe", url: "/painel/revendedor/indicacoes", icon: Gift },
      { title: "Níveis", url: "/painel/revendedor/niveis", icon: Crown },
      { title: "Ranking", url: "/painel/revendedor/ranking", icon: Award },
    ]},
    { label: "Vender", items: [
      { title: "Comprar Recarga", url: "/painel/revendedor/pedidos", icon: ShoppingCart },
      { title: "Comprar Créditos", url: "/painel/revendedor/comprar-creditos", icon: Coins },
      { title: "Meus Clientes", url: "/painel/revendedor/clientes", icon: Users },
      { title: "Minhas Vendas", url: "/painel/revendedor/licencas", icon: ShoppingBag },
      { title: "Minha Loja", url: "/painel/revendedor/loja", icon: Store, badge: "store-status" },
    ]},
    { label: "Configurar", items: [
      { title: "Preços de Extensões", url: "/painel/revendedor/extensoes", icon: Tag },
      { title: "Preços de Créditos", url: "/painel/revendedor/creditos", icon: Coins },
      { title: "API de Chaves", url: "/painel/revendedor/api", icon: KeyRound },
      { title: "API de Recargas", url: "/painel/revendedor/api-recargas", icon: Coins },
      { title: "Resetar chave", url: "/painel/revendedor/resetar-chave", icon: RotateCcw },
      { title: "Baixar Extensão", url: "/painel/revendedor/baixar-extensao", icon: Package },
      { title: "Instalar App", url: "/painel/revendedor/instalar-app", icon: Smartphone },
    ]},
  ],
  cliente: [
    { label: "Painel", items: [
      { title: "Dashboard", url: "/painel/cliente", icon: LayoutDashboard },
      { title: "Minhas Extensões", url: "/painel/cliente/extensoes", icon: Package },
    ]},
  ],
};

const ACCOUNT_ITEM = { title: "Ajustes da conta", url: "/painel/conta", icon: UserCog };

const dangerItemsByRole: Partial<Record<AppRole, { title: string; url: string; icon: any }[]>> = {
  gerente: [
    ACCOUNT_ITEM,
    { title: "Gateway de pagamento", url: "/painel/gerente/gateway", icon: CreditCard },
    { title: "API Método", url: "/painel/gerente/api-provedor", icon: KeyRound },
    { title: "API Recargas", url: "/painel/gerente/api-recargas", icon: Coins },
    { title: "API Revendedor", url: "/painel/gerente/api-revendedor", icon: KeyRound },
    { title: "Resetar chave", url: "/painel/gerente/resetar-chave", icon: RotateCcw },
    { title: "Instalar App", url: "/painel/gerente/instalar-app", icon: Smartphone },
    { title: "Ações destrutivas", url: "/painel/gerente/zona-risco", icon: Trash2 },
  ],
  revendedor: [
    ACCOUNT_ITEM,
    { title: "MisticPay (PIX)", url: "/painel/revendedor/integracoes/misticpay", icon: CreditCard },
    { title: "WhatsApp (Evolution)", url: "/painel/revendedor/integracoes/evolution", icon: MessageSquare },
  ],
  cliente: [
    ACCOUNT_ITEM,
  ],
};

const roleLabel: Record<AppRole, string> = {
  gerente: "Gerente",
  revendedor: "Revendedor",
  cliente: "Cliente",
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { primaryRole, loading, hasData } = useRole();
  const { signOut, user } = useAuth();

  const [openGroups, setOpenGroups] = useState<string[]>(["Visão geral", "Painel", "Vender", "Operação"]);
  
  // Sincroniza abertura com a rota atual se necessário
  useEffect(() => {
    if (primaryRole === "revendedor") {
      if (pathname.includes("/revendedor/resetar-chave") || pathname.includes("/revendedor/api") || pathname.includes("/revendedor/baixar-extensao") || pathname.includes("/revendedor/instalar-app") || pathname.includes("/revendedor/extensoes") || pathname.includes("/revendedor/creditos")) {
        setOpenGroups((prev) => (prev.includes("Configurar") ? prev : [...prev, "Configurar"]));
      }
    }
  }, [pathname, primaryRole]);

  const handleGroupToggle = (label: string) => {
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]));
  };

  const [providerUsage, setProviderUsage] = useState<{ used: number; limit: number } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [resellerBalance, setResellerBalance] = useState<number>(0);
  const [tier, setTier] = useState<{ name: string; color: string; slug: string } | null>(null);
  const [storeEnabled, setStoreEnabled] = useState<boolean | null>(null);
  const [isPartner, setIsPartner] = useState<boolean>(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; email: string | null }>({ display_name: null, avatar_url: null, email: null });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name, avatar_url, email").eq("id", user.id).maybeSingle();
      if (cancelled || !data) return;
      setProfile({ display_name: data.display_name, avatar_url: data.avatar_url, email: data.email });
    })();
    const ch = supabase.channel(`profile-sidebar-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new ?? {};
        setProfile((p) => ({ display_name: n.display_name ?? p.display_name, avatar_url: n.avatar_url ?? p.avatar_url, email: n.email ?? p.email }));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  const dangerItems = (primaryRole && dangerItemsByRole[primaryRole]) || [];
  const dangerActive = dangerItems.some((d) => pathname === d.url);
  const [dangerOpen, setDangerOpen] = useState(dangerActive);

  useEffect(() => {
    if (primaryRole !== "revendedor" || !user?.id) return;
    let cancelled = false;
    
    const load = async () => {
      try {
        const { data: r, error: rErr } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
        if (!r || cancelled || rErr) return;

        const [balanceRes, tierRes, storeRes, partnerRes] = await Promise.all([
          supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
          supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
          supabase.from("reseller_storefronts").select("is_enabled").eq("reseller_id", r.id).maybeSingle(),
          supabase.from("reseller_extension_price_overrides").select("id").eq("reseller_id", r.id).limit(1)
        ]);

        if (cancelled) return;

        if (balanceRes.data) setResellerBalance(balanceRes.data.balance_cents ?? 0);
        
        const row: any = Array.isArray(tierRes.data) ? tierRes.data[0] : tierRes.data;
        if (row) setTier({ name: row.name, color: row.color, slug: row.slug });
        
        if (storeRes.data) setStoreEnabled(storeRes.data.is_enabled ?? false);
        setIsPartner((partnerRes.data?.length ?? 0) > 0);
      } catch (err) {
        console.error("Erro ao carregar dados do revendedor:", err);
      }
    };

    load();
    const ch = supabase.channel(`rb-sidebar-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_balances" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_tier_state" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_storefronts" }, load)
      .subscribe();
      
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [primaryRole, user?.id]);

  const formatBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  useEffect(() => {
    if (primaryRole !== "gerente") return;
    let cancelled = false;
    const fetchBalance = async () => {
      setBalanceLoading(true);
      try {
        const { data, error } = await invokeAuthenticatedFunction("provider-api?action=status", { method: "GET" });
        if (cancelled) return;
        if (error || data?.error) {
          setProviderUsage(null);
        } else {
          const used = Number(data?.used ?? 0);
          const limit = Number(data?.max ?? data?.limit ?? 0);
          setProviderUsage({ used, limit });
        }
      } catch {
        if (!cancelled) setProviderUsage(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };

    const fetchGatewayBalance = async () => {
      setGatewayLoading(true);
      try {
        const { data, error } = await invokeAuthenticatedFunction("provider-api?action=gateway-balance", { method: "GET" });
        if (cancelled) return;
        if (error || data?.error) {
          setGatewayBalance(null);
        } else {
          setGatewayBalance(data?.balance ?? null);
        }
      } catch {
        if (!cancelled) setGatewayBalance(null);
      } finally {
        if (!cancelled) setGatewayLoading(false);
      }
    };

    const fetchCreditsBalance = async () => {
      setCreditsLoading(true);
      try {
        const { data, error } = await invokeAuthenticatedFunction("lovable-credits-api?action=balance", { method: "GET" });
        if (cancelled) return;
        if (error || data?.error) {
          setCreditsBalance(null);
        } else {
          const saldo = data?.data?.saldoReais ?? data?.saldoReais ?? (data?.data?.saldoCentavos != null ? data.data.saldoCentavos / 100 : data?.saldo);
          setCreditsBalance(saldo != null ? Number(saldo) : null);
        }
      } catch {
        if (!cancelled) setCreditsBalance(null);
      } finally {
        if (!cancelled) setCreditsLoading(false);
      }
    };

    fetchBalance();
    fetchGatewayBalance();
    fetchCreditsBalance();
    const id = setInterval(() => {
      fetchBalance();
      fetchGatewayBalance();
      fetchCreditsBalance();
    }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [primaryRole]);

  if ((loading && !hasData) || !primaryRole) return null;

  const groups = (groupsByRole[primaryRole] ?? []).map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (isPartner && item.url === "/painel/revendedor/niveis") return false;
      return true;
    })
  }));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        {(() => {
          const name = profile.display_name?.trim() || profile.email?.split("@")[0] || "Usuário";
          const initial = (name[0] || "U").toUpperCase();
          const avatar = profile.avatar_url;
          if (collapsed) {
            return (
              <NavLink to="/painel/conta" title="Editar perfil" className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden bg-primary/15 text-primary font-display font-bold text-sm border border-primary/30">
                {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : initial}
              </NavLink>
            );
          }
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/15 text-primary font-display font-bold border border-primary/30">
                  {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-sidebar-foreground">{name}</div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {roleLabel[primaryRole]}
                    </span>
                  </div>
                </div>
              </div>
              <NavLink
                to="/painel/conta"
                className="block w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 rounded-md border border-border hover:bg-sidebar-accent/50 hover:border-primary/40"
              >
                Editar perfil
              </NavLink>
            </div>
          );
        })()}
      </SidebarHeader>

      <SidebarContent>
        {primaryRole === "revendedor" && !collapsed && (
          <div className="px-2 pt-3">
            <div className="block rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Saldo na Plataforma
                </div>
              </div>
              <div className="mt-2 font-display text-lg font-bold">{formatBRL(resellerBalance)}</div>
              {tier && (
                <div
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}15` }}
                >
                  <Crown className="h-3 w-3 text-primary" />
                  {tier.name}
                </div>
              )}
              <NavLink
                to="/painel/revendedor/adicionar-saldo"
                className="mt-2 flex w-full items-center justify-center rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Adicionar saldo
              </NavLink>
            </div>
          </div>
        )}
        {primaryRole === "revendedor" && collapsed && (
          <div className="flex justify-center pt-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"
              title={`${tier ? tier.name + " · " : ""}Saldo: ${formatBRL(resellerBalance)}`}
            >
              <Wallet className="h-4 w-4 text-primary" />
            </div>
          </div>
        )}
        {primaryRole === "gerente" && !collapsed && (
          <div className="space-y-2 px-2 pt-3">
            <NavLink
              to="/painel/gerente/api-provedor"
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-2.5 transition-all hover:border-blue-500/40 hover:shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500 transition-transform group-hover:scale-110">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                  Licenças
                </div>
                <div className="mt-1 font-display text-sm font-bold text-foreground leading-none tabular-nums">
                  {balanceLoading && providerUsage === null
                    ? "—"
                    : providerUsage
                    ? `${providerUsage.used}/${providerUsage.limit || "∞"}`
                    : "—"}
                </div>
              </div>
            </NavLink>

            <NavLink
              to="/painel/gerente/gateway"
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-2.5 transition-all hover:border-purple-500/40 hover:shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-500 transition-transform group-hover:scale-110">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                  Gateway
                </div>
                <div className="mt-1 font-display text-sm font-bold text-foreground leading-none tabular-nums">
                  {gatewayLoading && gatewayBalance === null
                    ? "—"
                    : gatewayBalance != null
                    ? `R$ ${Number(gatewayBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "—"}
                </div>
              </div>
              <a
                href="https://misticpay.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground/60 transition-colors hover:text-purple-500"
                title="Ir para o gateway"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </NavLink>

            <NavLink
              to="/painel/gerente/api-recargas"
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-2.5 transition-all hover:border-amber-500/40 hover:shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500 transition-transform group-hover:scale-110">
                <Coins className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                  Provedor
                </div>
                <div className="mt-1 font-display text-sm font-bold text-foreground leading-none tabular-nums">
                  {creditsLoading && creditsBalance === null
                    ? "—"
                    : creditsBalance != null
                    ? `R$ ${Number(creditsBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "—"}
                </div>
              </div>
              <a
                href="https://lojinhalovable.com/revenda/saldo"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground/60 transition-colors hover:text-amber-500"
                title="Abrir painel do provedor"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </NavLink>
          </div>
        )}
        {primaryRole === "gerente" && collapsed && (
          <div className="flex flex-col items-center gap-2 pt-3">
            <NavLink
              to="/painel/gerente/api-provedor"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-500"
              title={providerUsage ? `Licenças: ${providerUsage.used}/${providerUsage.limit || "∞"}` : "Licenças geradas"}
            >
              <Wallet className="h-4 w-4" />
            </NavLink>
            <NavLink
              to="/painel/gerente/gateway"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-500"
              title={gatewayBalance ? `Saldo Gateway (MisticPay): R$ ${Number(gatewayBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Saldo no Gateway"}
            >
              <CreditCard className="h-4 w-4" />
            </NavLink>
            <NavLink
              to="/painel/gerente/api-recargas"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-yellow-500/30 bg-yellow-500/10 text-yellow-500"
              title={creditsBalance != null ? `Saldo Provedor: R$ ${Number(creditsBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Saldo no Provedor"}
            >
              <Coins className="h-4 w-4" />
            </NavLink>
          </div>
        )}

        {groups.map((group) => {
          const isOpen = openGroups.includes(group.label);
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel 
                className="cursor-pointer hover:text-foreground transition-colors flex items-center justify-between"
                onClick={() => handleGroupToggle(group.label)}
              >
                {group.label}
                <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
              </SidebarGroupLabel>
              <Collapsible open={isOpen}>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const active = pathname === item.url;
                        return (
                          <SidebarMenuItem key={item.url}>
                            <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                              <NavLink
                                to={item.url}
                                end
                                  className={cn(
                                    "flex items-center gap-2.5 rounded-md transition-colors",
                                    active
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                                  )}
                                >
                                  <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-primary")} />
                                {!collapsed && <span className="flex-1 text-xs">{item.title}</span>}
                                {!collapsed && item.badge === "store-status" && storeEnabled !== null && (
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                                      storeEnabled
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {storeEnabled ? "On" : "Off"}
                                  </span>
                                )}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <div className="mt-auto border-t border-sidebar-border p-2">
        {dangerItems.length > 0 && (
          <Collapsible open={dangerOpen} onOpenChange={setDangerOpen} className="mb-2">
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                  dangerActive
                    ? "bg-destructive/10 text-destructive"
                    : "text-destructive/80 hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left font-medium">Zona de risco</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform",
                        dangerOpen && "rotate-180",
                      )}
                    />
                  </>
                )}
              </button>
            </CollapsibleTrigger>
            {!collapsed && (
              <CollapsibleContent className="mt-1 space-y-0.5 pl-2">
                {dangerItems.map((d) => {
                  const active = pathname === d.url;
                  return (
                    <NavLink
                      key={d.url}
                      to={d.url}
                      end
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                        active
                          ? "bg-destructive/15 text-destructive font-medium"
                          : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                      )}
                    >
                      <d.icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-destructive" : "text-destructive")} />
                      <span>{d.title}</span>
                    </NavLink>
                  );
                })}
              </CollapsibleContent>
            )}
          </Collapsible>
        )}

        {!collapsed && user && (
          <div className="mb-2 px-2 py-1.5 text-[11px] text-muted-foreground truncate">
            {user.email}
          </div>
        )}
        <SidebarMenuButton
          onClick={() => {
            const root = document.documentElement;
            const isDark = root.classList.toggle("dark");
            try { localStorage.setItem("lov-theme", isDark ? "dark" : "light"); } catch {}
          }}
          tooltip="Alternar tema"
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Moon className="h-4 w-4 text-primary dark:hidden" />
          <Sun className="hidden h-4 w-4 text-primary dark:inline" />
          {!collapsed && <span>Alternar tema</span>}
        </SidebarMenuButton>
        <SidebarMenuButton
          onClick={signOut}
          tooltip="Sair"
          className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4 text-primary" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </div>
    </Sidebar>
  );
}
