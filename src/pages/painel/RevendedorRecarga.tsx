import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Zap, 
  Coins, 
  Crown, 
  Heart, 
  Star, 
  ShieldCheck, 
  Rocket, 
  MessageSquare, 
  Wallet, 
  PlusCircle, 
  ArrowRight,
  Infinity as InfinityIcon,
  Tag,
  KeyRound,
  History,
  LayoutDashboard,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  TrendingUp,
  Target,
  AlertTriangle,
  XCircle,
  Terminal,
  Code,
  Copy,
  Info,
  ChevronRight,
  Cpu,
  Globe,
  Lock,
  ZapOff,
  Search,
  Check,
  ShieldAlert,
  ArrowRightLeft,
  Activity,
  Layers,
  MousePointer2,
  BarChart3,
  Network,
  Bitcoin,
  MessageCircle,
  HelpCircle,
  ChevronDown,
  Timer,
  UserCircle,
  Hand,
  ListChecks
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import wizardHero from "@/assets/wizard-hero.png";
import revendovableLogo from "@/assets/revendovable-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BuyCreditsFlowModal } from "@/components/painel/BuyCreditsFlowModal";
import { useRechargeSettings } from "@/hooks/useRechargeSettings";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CREDIT_PLANS = [
  {
    id: "credits-10",
    name: "10 Lovable",
    description: "Ideal para testes e ativações rápidas.",
    price: 1500,
    icon: Coins,
    tag: "Iniciante",
    color: "text-blue-400",
    emoji: "⚡",
    popular: false
  },
  {
    id: "credits-50",
    name: "50 Lovable",
    description: "Volume para revendedores em crescimento.",
    price: 6000,
    icon: Star,
    tag: "Crescimento",
    color: "text-sky-400",
    emoji: "🚀",
    popular: false
  },
  {
    id: "credits-100",
    name: "100 Lovable",
    description: "Equilíbrio perfeito entre custo e volume.",
    price: 10000,
    icon: Zap,
    tag: "Ouro",
    color: "text-primary",
    emoji: "🏆",
    special: "100 GOLD",
    popular: true
  },
  {
    id: "credits-200",
    name: "200 Lovable",
    description: "Capacidade para operações profissionais.",
    price: 18000,
    icon: Rocket,
    tag: "Performance",
    color: "text-primary",
    emoji: "🔥",
    popular: false
  },
  {
    id: "credits-500",
    name: "500 Lovable",
    description: "Máximo lucro com menor custo unitário.",
    price: 45000,
    icon: Crown,
    tag: "Diamante",
    color: "text-amber-400",
    emoji: "💎",
    special: "500 DIAMOND",
    popular: false
  },
  {
    id: "credits-1000",
    name: "1000 Lovable",
    description: "Solução definitiva para grandes redes.",
    price: 85000,
    icon: ShieldCheck,
    tag: "Imortal",
    color: "text-fuchsia-400",
    emoji: "👑",
    special: "1000 IMMORTAL",
    popular: false
  }
];

type ApiPlan = { id: string; label: string; credits_amount: number; is_active: boolean; price_cents: number };
type Tier = { id: string; name: string } | null;

export default function RevendedorRecarga() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [resellerPrices, setResellerPrices] = useState<Record<number, number>>({});
  const [costs, setCosts] = useState<Record<number, number>>({});
  const [tier, setTier] = useState<Tier>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlan, setModalPlan] = useState<ApiPlan | null>(null);
  const { settings: rechargeSettings } = useRechargeSettings();
  const activeMode = rechargeSettings.active_mode;
  const buyDisabled = rechargeSettings.maintenance_enabled;

  const openBuyModal = (plan: ApiPlan) => {
    if (rechargeSettings.maintenance_enabled) {
      toast.warning(rechargeSettings.maintenance_message);
      return;
    }
    setModalPlan(plan);
    setModalOpen(true);
  };

  const refreshBalance = async () => {
    if (!user) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) return;
    const { data: b } = await supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle();
    if (b) setBalance(b.balance_cents);
  };

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setPlansLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) { setPlansLoading(false); return; }

      const [{ data: b }, { data: pl }, { data: rp }, costsResponse] = await Promise.all([
        supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
        supabase.from("credit_pricing_plans").select("id,label,credits_amount,is_active,price_cents").eq("is_active", true).order("credits_amount", { ascending: true }),
        supabase.from("reseller_credit_prices").select("credits_amount,price_cents,is_active").eq("reseller_id", r.id),
        supabase.functions.invoke("reseller-credit-costs", { method: "GET" }),
      ]);

      if (b) setBalance(b.balance_cents);
      setPlans((pl ?? []) as ApiPlan[]);

      const rpMap: Record<number, number> = {};
      (rp ?? []).forEach((row: any) => { if (row.is_active) rpMap[row.credits_amount] = row.price_cents; });
      setResellerPrices(rpMap);

      const costPayload = (costsResponse.data ?? {}) as { costs?: Record<string, number>; tierName?: string | null; effectiveTierId?: string; effectiveTierName?: string | null };
      const normalizedCosts: Record<number, number> = {};
      Object.entries(costPayload.costs ?? {}).forEach(([credits, cents]) => {
        const key = Number(credits);
        const value = Number(cents);
        if (Number.isFinite(key) && Number.isFinite(value) && value > 0) normalizedCosts[key] = value;
      });
      setCosts(normalizedCosts);
      setTier(costPayload.effectiveTierId ? { id: costPayload.effectiveTierId, name: costPayload.tierName ?? costPayload.effectiveTierName ?? "Nível atual" } : null);

      setPlansLoading(false);
    };
    fetchAll();
  }, [user]);

  const scrollToPlans = () => {
    const el = document.getElementById('plans-tabs');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-background pb-40 text-foreground overflow-x-hidden">
      {/* Page background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-[5%] left-[10%] h-[500px] w-[500px] rounded-full bg-primary/10 blur-[140px] animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute top-[40%] right-[5%] h-[400px] w-[400px] rounded-full bg-primary/5 blur-[120px] animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />
        <div className="absolute bottom-[10%] left-[30%] h-[450px] w-[450px] rounded-full bg-primary/8 blur-[140px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "4s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(var(--background))_90%)]" />
      </div>

      {/* Banner de manutenção (controlado pelo gerente) */}
      {rechargeSettings.maintenance_enabled && (
        <div className="relative z-10 px-4 pt-6">
          <div className="container mx-auto max-w-5xl">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 backdrop-blur-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-amber-500 uppercase tracking-wider">Sistema em manutenção</div>
                <p className="text-sm text-foreground/90">{rechargeSettings.maintenance_message}</p>
                <p className="text-xs text-muted-foreground">Novas compras estão temporariamente bloqueadas.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative pt-16 pb-12 px-4 overflow-hidden">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />
        </div>

        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col items-center text-center gap-8">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Pagamento via PIX</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-[1.05]">
                Recarga na <span className="italic text-primary">conta</span>
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                Adicione saldo à sua conta e movimente sua revenda sem fricção.
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-5 text-left transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center gap-2 mb-2">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Saldo Disponível</span>
                </div>
                <div className="relative text-2xl md:text-3xl font-bold tabular-nums tracking-tight">
                  {formatBRL(balance)}
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-5 text-left transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Modo de Pedido</span>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    buyDisabled
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    <span className={cn(
                      "h-1 w-1 rounded-full animate-pulse",
                      buyDisabled ? "bg-amber-500" : "bg-emerald-500"
                    )} />
                    {buyDisabled ? "Pausado" : "Ativo"}
                  </span>
                </div>
                <div className="relative flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-bold tracking-tight">
                    {rechargeSettings.maintenance_enabled
                      ? "Manutenção"
                      : activeMode === "automatico"
                      ? "Automático"
                      : "Manual"}
                  </span>
                </div>
              </div>
            </div>

            <Button 
              onClick={scrollToPlans}
              className="group h-12 px-8 rounded-xl bg-primary text-white font-semibold text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] transition-all"
            >
              Ver Planos
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>
        </div>
      </div>

      {/* Card explicativo - Modo dinâmico */}
      <div className="px-4 mb-12">
        <div className="container mx-auto max-w-5xl">
          <div className={cn(
            "relative overflow-hidden rounded-3xl border p-8 md:p-12 bg-gradient-to-br",
            activeMode === "automatico"
              ? "border-primary/20 from-card via-card to-primary/5"
              : "border-amber-500/20 from-card via-card to-amber-500/5"
          )}>
            {/* Decorative blobs */}
            <div className={cn(
              "pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl",
              activeMode === "automatico" ? "bg-primary/10" : "bg-amber-500/10"
            )} />
            <div className={cn(
              "pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl",
              activeMode === "automatico" ? "bg-primary/5" : "bg-amber-500/5"
            )} />

            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg",
                    activeMode === "automatico"
                      ? "bg-primary shadow-primary/30"
                      : "bg-amber-500 shadow-amber-500/30"
                  )}>
                    {activeMode === "automatico" ? <Zap className="h-6 w-6" /> : <Hand className="h-6 w-6" />}
                  </div>
                  <div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-[0.2em]",
                      activeMode === "automatico" ? "text-primary" : "text-amber-500"
                    )}>Modo Atual</div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                      {activeMode === "automatico" ? "Pedidos Automáticos" : "Pedidos Manuais"}
                    </h2>
                  </div>
                </div>

                <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">
                  {activeMode === "automatico" ? (
                    <>No modo automático, todas as suas recargas são processadas <span className="text-foreground font-semibold">instantaneamente</span> assim que o PIX é confirmado. Sem intervenção manual, sem espera — o saldo cai direto na sua conta e fica disponível para uso imediato.</>
                  ) : (
                    <>No modo manual, seus pedidos entram em uma <span className="text-foreground font-semibold">fila de processamento</span>. Após a confirmação do PIX, a equipe entrega os recargas diretamente no workspace do cliente. Você acompanha cada etapa em tempo real.</>
                  )}
                </p>

                <div className="grid sm:grid-cols-3 gap-3">
                  {(activeMode === "automatico" ? [
                    { icon: CheckCircle2, title: "Confirmação instantânea", desc: "PIX aprovado em segundos" },
                    { icon: Activity, title: "Sem fila de aprovação", desc: "Liberação 24/7 automática" },
                    { icon: ShieldCheck, title: "Auditoria completa", desc: "Histórico transparente" },
                  ] : [
                    { icon: ListChecks, title: "Pedido na fila", desc: "Entrada imediata após PIX" },
                    { icon: UserCircle, title: "Processado pela equipe", desc: "Entrega manual no workspace" },
                    { icon: Activity, title: "Acompanhamento em tempo real", desc: "Status atualizado a cada passo" },
                  ]).map((f) => (
                    <div key={f.title} className="rounded-xl border border-border bg-background/40 p-3 backdrop-blur-sm">
                      <f.icon className={cn("h-4 w-4 mb-2", activeMode === "automatico" ? "text-primary" : "text-amber-500")} />
                      <div className="text-xs font-semibold">{f.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status badge column */}
              <div className="lg:border-l lg:border-border lg:pl-10 flex lg:flex-col items-center gap-4">
                <div className="relative">
                  <div className={cn(
                    "absolute inset-0 rounded-full blur-xl animate-pulse",
                    activeMode === "automatico" ? "bg-emerald-500/30" : "bg-amber-500/30"
                  )} />
                  <div className={cn(
                    "relative flex h-20 w-20 items-center justify-center rounded-full border-2",
                    activeMode === "automatico" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
                  )}>
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full text-white",
                      activeMode === "automatico" ? "bg-emerald-500" : "bg-amber-500"
                    )}>
                      {activeMode === "automatico" ? <CheckCircle2 className="h-6 w-6" /> : <Hand className="h-6 w-6" />}
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</div>
                  <div className={cn(
                    "text-sm font-bold",
                    activeMode === "automatico" ? "text-emerald-500" : "text-amber-500"
                  )}>
                    {rechargeSettings.maintenance_enabled ? "Em manutenção" : "Sistema Ativo"}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer note */}
            <div className="relative mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className={cn("h-3.5 w-3.5", activeMode === "automatico" ? "text-primary" : "text-amber-500")} />
                <span>O modo (automático ou manual) é definido pelo gerente da plataforma.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo das Abas */}
      <section className="px-4 py-20 -mt-10">
        <div className="container mx-auto max-w-7xl">
          <Tabs defaultValue="plans" className="space-y-12" id="plans-tabs">
            <div className="flex justify-center border-b border-border">
              <TabsList className="bg-transparent h-12 gap-8 px-0">
                <TabsTrigger value="plans" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-sm transition-all px-4">
                  Planos
                </TabsTrigger>
                <TabsTrigger value="rules" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-sm transition-all px-4">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="api" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-sm transition-all px-4">
                  API
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent id="plans" value="plans" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
              {plansLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  Nenhum pacote disponível no momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {plans.map((plan) => {
                    const salePrice = resellerPrices[plan.credits_amount];
                    const costPrice = costs[plan.credits_amount] ?? plan.price_cents;
                    const perCredit = salePrice ? salePrice / plan.credits_amount : 0;
                    const isPopular = plan.credits_amount === 100;
                    const margin = salePrice && costPrice ? salePrice - costPrice : 0;
                    const marginPct = salePrice && costPrice ? ((salePrice - costPrice) / costPrice) * 100 : 0;

                    // Tier label based on credit amount
                    const tierLabel =
                      plan.credits_amount >= 1000 ? "Imortal" :
                      plan.credits_amount >= 500  ? "Lendário" :
                      plan.credits_amount >= 200  ? "Épico" :
                      plan.credits_amount >= 100  ? "Raro" :
                      plan.credits_amount >= 50   ? "Comum" :
                      "Inicial";

                    const tierIcon =
                      plan.credits_amount >= 1000 ? Crown :
                      plan.credits_amount >= 500  ? Sparkles :
                      plan.credits_amount >= 200  ? Rocket :
                      plan.credits_amount >= 100  ? Star :
                      plan.credits_amount >= 50   ? Zap :
                      Coins;

                    const TierIcon = tierIcon;

                    const tierEmoji =
                      plan.credits_amount >= 1000 ? "👑" :
                      plan.credits_amount >= 500  ? "💎" :
                      plan.credits_amount >= 200  ? "🚀" :
                      plan.credits_amount >= 100  ? "⭐" :
                      plan.credits_amount >= 50   ? "⚡" :
                      "🪙";

                    return (
                      <div
                        key={plan.id}
                        className={cn(
                          "group relative flex flex-col rounded-2xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl overflow-hidden",
                          isPopular
                            ? "border-primary/40 shadow-lg shadow-primary/10"
                            : "border-border hover:border-primary/30 hover:shadow-primary/5"
                        )}
                      >
                        {/* Glow */}
                        <div className={cn(
                          "pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full blur-3xl transition-opacity duration-500",
                          isPopular ? "bg-primary/15 opacity-100" : "bg-primary/10 opacity-0 group-hover:opacity-100"
                        )} />

                        {/* Background emoji */}
                        <div
                          aria-hidden
                          className="pointer-events-none absolute -bottom-6 -right-4 text-[140px] leading-none select-none opacity-[0.07] group-hover:opacity-[0.14] group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500"
                        >
                          {tierEmoji}
                        </div>
                        <div
                          aria-hidden
                          className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 text-3xl leading-none select-none opacity-20 group-hover:opacity-50 group-hover:scale-125 transition-all duration-300"
                        >
                          {tierEmoji}
                        </div>
                        {isPopular && (
                          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
                        )}

                        {/* Header */}
                        <div className="relative flex justify-between items-start mb-5">
                          <div className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                            isPopular ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-primary/10 text-primary"
                          )}>
                            <TierIcon className="h-5 w-5" />
                          </div>
                          {isPopular && (
                            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-primary border border-primary/30 flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5" /> Popular
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <div className="relative space-y-1 mb-5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Pacote {tierLabel}
                          </div>
                          <h3 className="font-display text-2xl font-bold tracking-tight">
                            {plan.credits_amount} <span className="text-primary">Lovables</span>
                          </h3>
                        </div>

                        {/* Price */}
                        <div className="relative mt-auto space-y-4">
                          <div className="rounded-xl bg-secondary/40 border border-border/50 p-3">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                              Seu custo {tier && <span className="opacity-70 normal-case font-medium">· {tier.name}</span>}
                            </div>
                            <div className="text-2xl font-bold tabular-nums text-primary">
                              {formatBRL(costPrice)}
                            </div>
                          </div>

                          <div className="space-y-1.5 text-[10px]">
                            {salePrice ? (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Venda sugerida</span>
                                <span className="font-semibold tabular-nums">{formatBRL(salePrice)}</span>
                              </div>
                            ) : null}

                            {margin > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Lucro estimado</span>
                                <span className="font-semibold tabular-nums text-emerald-500">
                                  +{formatBRL(margin)} {marginPct > 0 && <span className="opacity-70">({marginPct.toFixed(0)}%)</span>}
                                </span>
                              </div>
                            )}

                            {perCredit > 0 && (
                              <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                                <span className="text-muted-foreground">Por unidade</span>
                                <span className="font-mono tabular-nums text-muted-foreground">{formatBRL(perCredit)}</span>
                              </div>
                            )}
                          </div>

                          <Button
                            onClick={() => openBuyModal(plan)}
                            disabled={buyDisabled}
                            className={cn(
                              "w-full h-11 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2",
                              isPopular
                                ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/30"
                                : "bg-secondary text-foreground hover:bg-primary hover:text-white",
                              buyDisabled && "opacity-60 cursor-not-allowed hover:bg-secondary hover:text-foreground"
                            )}
                          >
                            {buyDisabled ? "Indisponível" : "Comprar pacote"}
                            {!buyDisabled && <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* FAQ Section */}
              <div className="mt-32 space-y-16">
                <div className="text-center space-y-3">
                  <h3 className="text-4xl font-bold tracking-tighter">Ficou com alguma dúvida?</h3>
                  <p className="text-muted-foreground text-sm font-medium max-w-xl mx-auto">Tudo o que você precisa saber para escalar sua operação Lovable.</p>
                </div>

                <div className="max-w-3xl mx-auto">
                  <Accordion type="single" collapsible className="w-full space-y-3">
                    {[
                      { q: "Como funciona o abastecimento?", a: "Integração via MisticPay (D+0). Confirmou o PIX, o saldo cai na hora." },
                      { q: "Quais as taxas de revenda?", a: "Sem taxas mensais. Você lucra na diferença entre o custo do pacote e o valor de venda." },
                      { q: "É possível automatizar via API?", a: "Sim, documentação completa na aba API para integração via Webhooks." }
                    ].map((item, i) => (
                      <AccordionItem key={i} value={`item-${i}`} className="border border-border bg-card/40 backdrop-blur-sm rounded-2xl px-6 overflow-hidden">
                        <AccordionTrigger className="hover:no-underline font-bold text-sm text-left py-4">{item.q}</AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground font-medium pb-4 leading-relaxed">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                {/* Footer Section Style */}
                <div className="rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-16 text-white text-center space-y-8 shadow-lg shadow-primary/20">
                   <h2 className="text-5xl md:text-6xl font-bold tracking-tighter ">Movimentando milhões de <br /> transações todos os dias.</h2>
                   <p className="text-white/80 text-xl font-medium max-w-2xl mx-auto">Sem surpresas, sem letras miúdas. Aqui o preço é fixo e previsível em todas as suas operações.</p>
                   <Button className="h-16 px-12 rounded-2xl bg-white text-primary font-bold   hover:bg-zinc-100 transition-all">
                      Abrir conta agora
                   </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
              <div className="grid lg:grid-cols-2 gap-12">
                <div className="group relative rounded-3xl border border-border bg-card p-1 overflow-hidden transition-all hover:border-primary/30">
                  <div className="bg-primary/10 p-12 space-y-8 rounded-[3.8rem]">
                    <div className="flex items-center gap-6 text-left">
                      <div className="h-16 w-16 rounded-3xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <div>
                        <h3 className="font-display text-4xl font-bold tracking-tight">Venda com Segurança</h3>
                        <p className="text-primary/60 font-bold  text-[10px] ">Métodos 100% Homologados</p>
                      </div>
                    </div>

                    <div className="grid gap-4 text-left">
                    {[
                      { plan: "Elite (20 Lovable)", limit: "200 envios/dia", icon: MousePointer2 },
                      { plan: "Master (200 Lovable +)", limit: "1.000 envios/dia", icon: BarChart3 },
                      { plan: "Enterprise Plan", limit: "2.000 envios/dia", icon: Network }
                    ].map((rule, i) => (
                        <div key={i} className="flex items-center justify-between p-6 rounded-3xl bg-white/50 dark:bg-black/20 border border-white dark:border-white/5 backdrop-blur-sm group-hover:scale-[1.02] transition-transform">
                          <div className="flex items-center gap-4 text-left">
                            <rule.icon className="h-5 w-5 text-primary opacity-60" />
                            <span className="font-bold text-sm tracking-tight">{rule.plan}</span>
                          </div>
                          <div className="px-4 py-2 rounded-2xl bg-primary/10 text-primary dark:text-primary font-bold text-[10px] ">
                            {rule.limit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-8 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-semibold">Zona de Risco</h3>
                  </div>

                  <div className="space-y-3">
                    {[
                      { title: "Standard 100 Lovable", desc: "Instabilidade Crítica" },
                      { title: "Planos High (400+)", desc: "Incompatível com Buffer" },
                      { title: "Contas Compartilhadas", desc: "Bloqueio Automático" }
                    ].map((ban, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-destructive/5 border border-destructive/10">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-destructive">{ban.title}</span>
                          <span className="text-[10px] text-muted-foreground">{ban.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </TabsContent>

            <TabsContent value="api" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
              <div className="rounded-xl border border-border bg-card p-8 md:p-12 space-y-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">API para Desenvolvedores</h3>
                    <p className="text-muted-foreground text-sm max-w-md">Integre sua operação via Webhooks e REST.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" className="h-12 px-6 rounded-lg text-sm font-semibold" asChild>
                      <Link to="/painel/revendedor/api">Documentação</Link>
                    </Button>
                    <Button className="h-12 px-6 rounded-lg bg-primary text-white text-sm font-semibold" onClick={() => toast.success("Endpoint Copiado!")}>
                      <Copy className="h-4 w-4 mr-2" /> Endpoint
                    </Button>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL de Produção</span>
                      </div>
                      <div className="p-4 rounded-lg bg-secondary border border-border font-mono text-xs break-all">
                        POST https://api.revendovable.com/v1/recharge
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border border-border space-y-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <div className="text-xs font-semibold">Baixa Latência</div>
                        <p className="text-[10px] text-muted-foreground">Resposta em menos de 200ms.</p>
                      </div>
                      <div className="p-4 rounded-lg border border-border space-y-2">
                        <Lock className="h-4 w-4 text-primary" />
                        <div className="text-xs font-semibold">Segurança AES-256</div>
                        <p className="text-[10px] text-muted-foreground">Transações criptografadas.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Request Exemplo</span>
                    <pre className="p-6 rounded-lg bg-secondary font-mono text-xs leading-relaxed border border-border overflow-x-auto">
{`{
  "auth_token": "sk_rev_...",
  "payload": {
    "plan": "recharge-500",
    "target": "usr_99a"
  }
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* 
          DOCK NAVIGATION - ULTRA MINIMALIST 
      */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-6">
        <div className="bg-background border border-border p-2 rounded-2xl shadow-xl flex items-center justify-between">
          <Link to="/painel/revendedor" className="flex h-12 w-12 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-all">
            <LayoutDashboard className="h-5 w-5" />
          </Link>
          
          <div className="flex bg-secondary rounded-xl p-1 gap-1">
            <Link to="/painel/revendedor/licencas" className="flex items-center gap-2 px-4 h-10 rounded-lg text-muted-foreground hover:text-foreground transition-all font-semibold text-[11px]">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Vendas</span>
            </Link>
            <Link to="/painel/revendedor/recarga" className="flex items-center gap-2 px-6 h-10 rounded-lg bg-primary text-white shadow-md transition-all font-semibold text-[11px]">
              <Zap className="h-4 w-4" />
              <span>Recarga</span>
            </Link>
          </div>

          <Link to="/painel/revendedor/pedidos" className="flex h-12 w-12 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-all">
            <KeyRound className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <BuyCreditsFlowModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={modalPlan}
        costPrice={modalPlan ? (costs[modalPlan.credits_amount] ?? modalPlan.price_cents) : 0}
        balance={balance}
        onSuccess={refreshBalance}
        mode={activeMode}
      />
    </div>
  );
}
