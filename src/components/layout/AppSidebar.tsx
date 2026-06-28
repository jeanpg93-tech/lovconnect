import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ExternalLink,
  LayoutDashboard,
  Package,
  Users,
  Store,
  LogOut,
  Moon,
  Sun,
  CreditCard,
  KeyRound,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Ticket,
  ShoppingCart,
  Tag,
  Crown,
  MessageSquare,
  UserCog,
  Send,
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
  Puzzle,
  ShieldCheck,
  MessageCircle,
  CalendarClock,
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
import { useProviderCommitments } from "@/hooks/useProviderCommitments";
import { useResellerEnabledMethods } from "@/hooks/useResellerEnabledMethods";
import { useTranslation } from "react-i18next";

type Item = { title: string; url: string; icon: any; badge?: "store-status"; tour?: string };
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
      { title: "Ativações", url: "/painel/gerente/ativacoes", icon: ShieldCheck },
      { title: "Avisos", url: "/painel/gerente/avisos", icon: Megaphone },
      { title: "Promoções", url: "/painel/gerente/acoes-especiais", icon: Sparkles },
      { title: "Contas demo", url: "/painel/gerente/contas-demo", icon: UserCheck },
      { title: "Bot Telegram", url: "/painel/gerente/telegram", icon: Send },
      { title: "WhatsApp do Sistema", url: "/painel/gerente/whatsapp-sistema", icon: MessageCircle },
    ]},
    { label: "Rede", items: [
      { title: "Revendedores", url: "/painel/gerente/revendedores", icon: Store },
      { title: "Níveis", url: "/painel/gerente/niveis", icon: Crown },
      { title: "Afiliados", url: "/painel/gerente/affiliados", icon: Ticket },
      { title: "Ranking", url: "/painel/revendedor/ranking", icon: Trophy },
      { title: "Premiação Ranking", url: "/painel/gerente/ranking-prizes", icon: Gift },
    ]},
    { label: "Produtos", items: [
      { title: "Geração de Licenças", url: "/painel/gerente/geracao-manual", icon: Sparkles },
      { title: "Geração de Recargas", url: "/painel/gerente/geracao-manual-creditos", icon: Coins },
      { title: "Upload Extensão", url: "/painel/gerente/upload-extensao", icon: Package },
    ]},
    { label: "Gestão produtos", items: [
      { title: "Gerenciar Recargas", url: "/painel/gerente/recargas", icon: Coins },
      { title: "Gerenciar Licenças", url: "/painel/gerente/todas-licencas", icon: KeyRound },
      { title: "Pacotes", url: "/painel/gerente/pacotes", icon: Package },
    ]},
  ],
  revendedor: [
    { label: "Painel", items: [
      { title: "Dashboard", url: "/painel/revendedor", icon: LayoutDashboard, tour: "menu-dashboard" },
      { title: "Carteira", url: "/painel/revendedor/carteira", icon: Wallet, tour: "menu-carteira" },
      { title: "Indique e ganhe", url: "/painel/revendedor/indicacoes", icon: Gift, tour: "menu-indicacoes" },
      { title: "Ranking", url: "/painel/revendedor/ranking", icon: Trophy },
    ]},
    { label: "Mensalidade", items: [
      { title: "Gerar Chave", url: "/painel/revendedor/gerar-chave", icon: Sparkles, tour: "menu-gerar-chave" },
      { title: "Minhas Chaves", url: "/painel/revendedor/minhas-chaves", icon: KeyRound, tour: "menu-minhas-chaves" },
      { title: "Minhas Cobranças", url: "/painel/revendedor/cobrancas", icon: Wallet },
    ]},
    { label: "Vendas - Packs", items: [
      { title: "Gerar Chave", url: "/painel/revendedor/gerar-chave", icon: Sparkles, tour: "menu-gerar-chave" },
      { title: "Minhas Chaves", url: "/painel/revendedor/minhas-chaves", icon: KeyRound, tour: "menu-minhas-chaves" },
      { title: "Comprar Packs", url: "/painel/revendedor/comprar-pacote", icon: ShoppingCart },
      { title: "Histórico", url: "/painel/revendedor/historico-pacote", icon: HistoryIcon },
    ]},
    { label: "Minhas vendas", items: [
      { title: "Recargas", url: "/painel/revendedor/recargas", icon: Zap },
      { title: "Plano 3K", url: "/painel/revendedor/planos-vendidos", icon: CalendarClock },
      { title: "API Claude", url: "/painel/revendedor/claude", icon: Sparkles },
      { title: "Licenças", url: "/painel/revendedor/licencas", icon: Puzzle },
    ]},
    { label: "Configurarações", items: [
      { title: "Minha Loja", url: "/painel/revendedor/loja", icon: Store, badge: "store-status", tour: "menu-loja" },
      { title: "Precificação", url: "/painel/revendedor/precos", icon: Tag, tour: "menu-precos" },
      { title: "Baixar Extensão", url: "/painel/revendedor/baixar-extensao", icon: Package, tour: "menu-extensao" },
      { title: "API Licenças", url: "/painel/revendedor/api", icon: KeyRound },
      { title: "API Recargas", url: "/painel/revendedor/api-recargas", icon: Coins },
      { title: "Resetar chave", url: "/painel/revendedor/resetar-chave", icon: RotateCcw },
      { title: "Editar perfil", url: "/painel/conta", icon: UserCog },
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
    { title: "API Claude", url: "/painel/gerente/api-claude", icon: Sparkles },
    { title: "API Revendedor", url: "/painel/gerente/api-revendedor", icon: KeyRound },
    { title: "Resetar chave", url: "/painel/gerente/resetar-chave", icon: RotateCcw },
    { title: "Instalar App", url: "/painel/gerente/instalar-app", icon: Smartphone },
    { title: "Ações destrutivas", url: "/painel/gerente/zona-risco", icon: Trash2 },
  ],
  revendedor: [
    ACCOUNT_ITEM,
    { title: "MisticPay API", url: "/painel/revendedor/integracoes/misticpay", icon: CreditCard },
    { title: "WhatsApp API", url: "/painel/revendedor/integracoes/whatsapp", icon: MessageSquare },
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
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { primaryRole, loading, hasData, isSubscription, isPack, packCredits, packLifetimePurchased } = useRole();
  const { signOut, user } = useAuth();
  const { t } = useTranslation();
  const tItem = (s: string) => t(`sidebar.items.${s}`, { defaultValue: s });
  const tGroup = (s: string) => t(`sidebar.groups.${s}`, { defaultValue: s });

  const [openGroups, setOpenGroups] = useState<string[]>(["Visão geral", "Painel", "Vender", "Operação", "Mensalidade", "Vendas - Packs"]);
  
  // Sincroniza abertura com a rota atual se necessário
  useEffect(() => {
    if (primaryRole === "revendedor") {
      if (pathname.includes("/revendedor/resetar-chave") || pathname.includes("/revendedor/api") || pathname.includes("/revendedor/baixar-extensao") || pathname.includes("/revendedor/instalar-app")) {
        setOpenGroups((prev) => (prev.includes("Configurarações") ? prev : [...prev, "Configurarações"]));
      }
    }
  }, [pathname, primaryRole]);

  const handleGroupToggle = (label: string) => {
    setOpenGroups((prev) => (prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]));
  };

  const [providerUsage, setProviderUsage] = useState<{ used: number; limit: number } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [lovaxUsage, setLovaxUsage] = useState<{ used: number; limit: number } | null>(null);
  const [lovaxLoading, setLovaxLoading] = useState(false);
  const [activeMethod, setActiveMethod] = useState<"flow" | "lovax">("flow");
  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [resellerBalance, setResellerBalance] = useState<number>(0);
  const [tier, setTier] = useState<{ name: string; color: string; slug: string } | null>(null);
  const [storeEnabled, setStoreEnabled] = useState<boolean | null>(null);
  const [isPartner, setIsPartner] = useState<boolean>(false);
  const [claudeEnabled, setClaudeEnabled] = useState<boolean>(false);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; email: string | null }>({ display_name: null, avatar_url: null, email: null });

  const isManager = primaryRole === "gerente";
  const commitments = useProviderCommitments(isManager);
  const enabledMethods = useResellerEnabledMethods();

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

  const dangerItems = ((primaryRole && dangerItemsByRole[primaryRole]) || []).filter((d) => {
    if (isSubscription && d.url === "/painel/revendedor/integracoes/misticpay") return false;
    return true;
  });
  const dangerActive = dangerItems.some((d) => pathname === d.url);
  const [dangerOpen, setDangerOpen] = useState(dangerActive);

  useEffect(() => {
    if (primaryRole !== "revendedor" || !user?.id) return;
    let cancelled = false;
    
    const load = async () => {
      try {
        const { data: r, error: rErr } = await supabase.from("resellers").select("id, claude_enabled").eq("user_id", user.id).maybeSingle();
        if (!r || cancelled || rErr) return;
        setClaudeEnabled(!!(r as any).claude_enabled);

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

    fetchBalance();
    fetchGatewayBalance();
    const fetchLovax = async () => {
      setLovaxLoading(true);
      try {
        const { data, error } = await invokeAuthenticatedFunction("lovax-api?action=status", { method: "GET" });
        if (cancelled) return;
        if (error || data?.error || data?.provider_error) {
          setLovaxUsage(null);
        } else {
          const used = Number(data?.used ?? 0);
          const limit = Number(data?.max ?? data?.limit ?? 0);
          setLovaxUsage({ used, limit });
        }
      } catch {
        if (!cancelled) setLovaxUsage(null);
      } finally {
        if (!cancelled) setLovaxLoading(false);
      }
    };
    fetchLovax();
    const id = setInterval(() => {
      fetchBalance();
      fetchGatewayBalance();
      fetchLovax();
    }, 60_000);

    // Método de entrega ativo (compartilhado via app_settings)
    const fetchActiveMethod = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "licencas.delivery.method")
        .maybeSingle();
      const v = (data?.value as any)?.method;
      if (!cancelled && (v === "flow" || v === "lovax")) setActiveMethod(v);
    };
    fetchActiveMethod();
    const ch = supabase
      .channel("sidebar-active-method")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.licencas.delivery.method" },
        fetchActiveMethod
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(id);
      supabase.removeChannel(ch);
    };
  }, [primaryRole]);

  // Aplica scrollbars finos/vermelhos no painel (admin e revendedor)
  useEffect(() => {
    const root = document.documentElement;
    if (primaryRole === "gerente" || primaryRole === "revendedor") {
      root.setAttribute("data-admin-panel", "true");
    } else {
      root.removeAttribute("data-admin-panel");
    }
    return () => {
      root.removeAttribute("data-admin-panel");
    };
  }, [primaryRole]);

  if ((loading && !hasData) || !primaryRole) return null;

  const groups = (groupsByRole[primaryRole] ?? []).map(group => ({
    ...group,
    label: isPack && group.label === "Minhas vendas" ? "Vendas - Saldo" : group.label,
    items: group.items.filter(item => {
      if (isPartner && item.url === "/painel/revendedor/niveis") return false;
      if (!claudeEnabled && item.url === "/painel/revendedor/claude") return false;
      // Esconde páginas cujos métodos estão desabilitados globalmente.
      if (primaryRole === "revendedor") {
        if (!enabledMethods.recharges && (
          item.url === "/painel/revendedor/recargas" ||
          item.url === "/painel/revendedor/api-recargas"
        )) return false;
        if (!enabledMethods.plano3k && item.url === "/painel/revendedor/planos-vendidos") return false;
      }
      // Filtra grupos por modo
      if (group.label === "Vendas - Packs" && !isPack) return false;
      if (group.label === "Mensalidade" && !isSubscription) return false;
      if (isSubscription) {
        const hiddenForSubscription = [
          "/painel/revendedor/carteira",
          "/painel/revendedor/recargas",
          "/painel/revendedor/precos",
          "/painel/revendedor/api-recargas",
          "/painel/revendedor/loja",
          "/painel/revendedor/indicacoes",
          "/painel/revendedor/licencas",
        ];
        if (hiddenForSubscription.includes(item.url)) return false;
      } else if (isPack) {
        // Modo Pack é uma opção ADICIONAL: não esconde nada do fluxo normal.
        // O revendedor mantém todos os menus (carteira, loja, recargas, etc.)
        // e ganha os itens do grupo "Vendas - Packs" por cima.
      } else {
        // Esconde itens exclusivos de mensalista para revendedores normais
        const subscriptionOnly = [
          "/painel/revendedor/gerar-chave",
          "/painel/revendedor/minhas-chaves",
          "/painel/revendedor/cobrancas",
          "/painel/revendedor/comprar-pacote",
          "/painel/revendedor/historico-pacote",
        ];
        if (subscriptionOnly.includes(item.url)) return false;
      }
      return true;
    })
  })).filter(g => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="relative border-b border-sidebar-border px-3 py-3">
        <button
            type="button"
            onClick={toggleSidebar}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "absolute -right-3 top-3 z-20 hidden md:flex h-6 w-6 items-center justify-center rounded-full",
              "border border-sidebar-border bg-sidebar text-muted-foreground/70 shadow-sm",
              "transition-all hover:text-primary hover:border-primary/50 hover:bg-sidebar-accent",
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
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
                  {primaryRole === "revendedor" && (tier || isSubscription || isPack) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {tier && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}15` }}
                          title={`Nível: ${tier.name}`}
                        >
                          <Crown className="h-2.5 w-2.5" />
                          {tier.name}
                        </span>
                      )}
                      {isSubscription && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-500">
                          Mensalista
                        </span>
                      )}
                      {isPack && (
                        <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                          Pack
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </SidebarHeader>

      <SidebarContent>
        {primaryRole === "revendedor" && !collapsed && (
          <div className="px-2 pt-3">
            <div data-tour="dashboard-saldo" className="block rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Saldo na Plataforma
                </div>
              </div>
              <div className="mt-2 font-display text-lg font-bold">{formatBRL(resellerBalance)}</div>
              <NavLink
                to="/painel/revendedor/carteira#saldo"
                className="mt-2 flex w-full items-center justify-center rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Adicionar saldo
              </NavLink>
            </div>
            {isPack && (
              <div className="mt-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Packs
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex gap-3">
                    <div>
                      <div className="text-[9px] text-muted-foreground/80 leading-none">Disponíveis</div>
                      <div className={cn(
                        "mt-0.5 font-display text-sm font-bold tabular-nums leading-none",
                        packCredits >= 10 ? "text-emerald-500" : packCredits >= 5 ? "text-amber-500" : "text-destructive",
                      )}>
                        {packCredits}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground/80 leading-none">Total</div>
                      <div className="mt-0.5 font-display text-sm font-bold tabular-nums leading-none text-foreground">
                        {packLifetimePurchased}
                      </div>
                    </div>
                  </div>
                  <NavLink
                    to="/painel/revendedor/comprar-pacote"
                    className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    Comprar
                  </NavLink>
                </div>
              </div>
            )}
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
          <div className="space-y-1.5 px-2 pt-3">
            <NavLink
              to="/painel/gerente/todas-licencas?tab=api"
              className={cn(
                "group relative flex items-center gap-2.5 overflow-hidden rounded-xl border bg-card p-2 transition-all hover:shadow-sm",
                activeMethod === "lovax"
                  ? "border-violet-500/60 ring-1 ring-violet-500/40"
                  : "border-border hover:border-violet-500/40"
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-500 transition-transform group-hover:scale-110">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                  <span>MétodoLovax</span>
                  {activeMethod === "lovax" && (
                    <span className="rounded-full bg-violet-500/15 px-1.5 py-[1px] text-[8px] font-bold tracking-wider text-violet-500">
                      ATIVO
                    </span>
                  )}
                </div>
                <div className="mt-1 font-display text-xs font-bold text-foreground leading-none tabular-nums">
                  {lovaxLoading && lovaxUsage === null
                    ? "—"
                    : lovaxUsage
                    ? `${lovaxUsage.used}/${lovaxUsage.limit || "∞"}`
                    : "—"}
                </div>
                <div className="mt-0.5 text-[9px] text-muted-foreground/80 leading-none">Licenças usadas</div>
                {lovaxUsage && lovaxUsage.limit ? (
                  <div className="mt-0.5 text-[9px] font-semibold text-violet-500/90 leading-none tabular-nums">
                    {Math.max(0, lovaxUsage.limit - lovaxUsage.used)} restantes
                  </div>
                ) : null}
              </div>
            </NavLink>

            <NavLink
              to="/painel/gerente/gateway"
              className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-card p-2 transition-all hover:border-purple-500/40 hover:shadow-sm"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-500 transition-transform group-hover:scale-110">
                <CreditCard className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                  Gateway
                </div>
                <div className="mt-1 font-display text-xs font-bold text-foreground leading-none tabular-nums">
                  {gatewayLoading && gatewayBalance === null
                    ? "—"
                    : gatewayBalance != null
                    ? `R$ ${Number(gatewayBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  window.open("https://misticpay.com/dashboard", "_blank", "noopener,noreferrer");
                }}
                className="text-muted-foreground/60 transition-colors hover:text-purple-500"
                title="Ir para o gateway"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            </NavLink>

            {/* Comprometido em Packs (somente método ativo) */}
            {(() => {
              const methodRemaining =
                activeMethod === "flow" ? commitments.flowRemaining : commitments.lovaxRemaining;
              const realAvail = Number.isFinite(methodRemaining)
                ? Math.max(0, methodRemaining - commitments.committed)
                : Number.POSITIVE_INFINITY;
              const overcommitted =
                commitments.committed > 0 && commitments.committed >= methodRemaining;
              const methodLabel = activeMethod === "flow" ? "MétodoFlow" : "MétodoLovax";
              return (
                <NavLink
                  to="/painel/gerente/pacotes"
                  className={cn(
                    "group relative flex items-center gap-2.5 overflow-hidden rounded-xl border bg-card p-2 transition-all hover:shadow-sm",
                    overcommitted
                      ? "border-destructive/60 ring-1 ring-destructive/40"
                      : "border-border hover:border-emerald-500/40"
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 transition-transform group-hover:scale-110">
                    <Package className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground leading-none">
                      <span className="truncate">Reserva · {methodLabel}</span>
                      {overcommitted && (
                        <span className="rounded-full bg-destructive/15 px-1.5 py-[1px] text-[8px] font-bold tracking-wider text-destructive">
                          ALERTA
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-display text-xs font-bold text-foreground leading-none tabular-nums">
                      {commitments.loading ? "—" : commitments.committed}
                    </div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground/80 leading-none">
                      comprometidas
                    </div>
                    {!commitments.loading && (
                      <div
                        className={cn(
                          "mt-0.5 text-[9px] font-semibold leading-none tabular-nums",
                          overcommitted ? "text-destructive" : "text-emerald-500/90"
                        )}
                      >
                        {Number.isFinite(realAvail) ? realAvail : "∞"} disponíveis
                      </div>
                    )}
                  </div>
                </NavLink>
              );
            })()}
          </div>
        )}
        {primaryRole === "gerente" && collapsed && (
          <div className="flex flex-col items-center gap-2 pt-3">
            <NavLink
              to="/painel/gerente/todas-licencas?tab=api"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border bg-violet-500/10 text-violet-500",
                activeMethod === "lovax" ? "border-violet-500 ring-1 ring-violet-500/50" : "border-violet-500/30"
              )}
              title={lovaxUsage ? `MétodoLovax — Licenças usadas: ${lovaxUsage.used}/${lovaxUsage.limit || "∞"}` : "MétodoLovax"}
            >
              <Sparkles className="h-4 w-4" />
            </NavLink>
            <NavLink
              to="/painel/gerente/gateway"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-500"
              title={gatewayBalance ? `Saldo Gateway (MisticPay): R$ ${Number(gatewayBalance).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Saldo no Gateway"}
            >
              <CreditCard className="h-4 w-4" />
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
                {tGroup(group.label)}
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
                            <SidebarMenuButton asChild isActive={active} tooltip={tItem(item.title)}>
                              <NavLink
                                to={item.url}
                                end
                                  data-tour={item.tour}
                                  className={cn(
                                    "flex items-center gap-2.5 rounded-md transition-colors",
                                    active
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                                  )}
                                >
                                  <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-primary")} />
                                {!collapsed && <span className="flex-1 text-xs">{tItem(item.title)}</span>}
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
                      <span>{tItem(d.title)}</span>
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
