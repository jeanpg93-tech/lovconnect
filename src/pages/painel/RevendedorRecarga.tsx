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
  ,FileDown
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
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

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

export default function RevendedorRecargas() {
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
                Recargas na <span className="italic text-primary">conta</span>
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                Adicione saldo à sua conta e movimente sua revenda sem fricção.
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-3 sm:p-5 text-left transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center gap-2 mb-2">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Saldo Disponível</span>
                </div>
                <div className="relative text-lg sm:text-2xl md:text-3xl font-bold tabular-nums tracking-tight">
                  {formatBRL(balance)}
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-3 sm:p-5 text-left transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] truncate">Modo de Pedido</span>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider shrink-0",
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
                  <span className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight">
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
      <div className="px-1 sm:px-4 mb-12">
        <div className="container mx-auto max-w-7xl px-0 sm:px-4">
          <div className={cn(
            "relative overflow-hidden rounded-2xl sm:rounded-3xl border p-3 sm:p-8 md:p-12 bg-gradient-to-br text-center",
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
                <div className="gap-3 flex items-center justify-center">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                  {(activeMode === "automatico" ? [
                    { icon: CheckCircle2, title: "Confirmação instantânea", desc: "PIX aprovado em segundos" },
                    { icon: Activity, title: "Sem fila de aprovação", desc: "Liberação 24/7 automática" },
                    { icon: ShieldCheck, title: "Auditoria completa", desc: "Histórico transparente" },
                  ] : [
                    { icon: ListChecks, title: "Pedido na fila", desc: "Entrada imediata após PIX" },
                    { icon: UserCircle, title: "Processado pela equipe", desc: "Entrega manual no workspace" },
                    { icon: Activity, title: "Acompanhamento em tempo real", desc: "Status atualizado a cada passo" },
                  ]).map((f, idx) => (
                    <div key={f.title} className={cn(
                      "rounded-xl border border-border bg-background/40 p-2.5 sm:p-3 backdrop-blur-sm flex flex-col items-center text-center",
                      idx === 2 && "col-span-2 sm:col-span-1"
                    )}>
                      <f.icon className={cn("h-4 w-4 mb-1.5 sm:mb-2", activeMode === "automatico" ? "text-primary" : "text-amber-500")} />
                      <div className="text-[11px] sm:text-xs font-semibold leading-tight">{f.title}</div>
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 leading-tight">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status badge column */}
              <div className="lg:border-l lg:border-border lg:pl-10 lg:flex-col gap-4 flex items-center justify-center">
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
              <TabsList className="bg-transparent h-12 gap-2 sm:gap-8 px-0 w-full sm:w-auto justify-start sm:justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsTrigger value="plans" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                  Planos
                </TabsTrigger>
                <TabsTrigger value="rules" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                  Limite de uso
                </TabsTrigger>
                <TabsTrigger value="api" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                  API's
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
                (() => {
                  const chunkSize = 3;
                  const chunks: ApiPlan[][] = [];
                  for (let i = 0; i < plans.length; i += chunkSize) {
                    chunks.push(plans.slice(i, i + chunkSize));
                  }
                  return (
                <Carousel opts={{ align: "start", loop: false, slidesToScroll: 1, containScroll: "trimSnaps", dragFree: false }} className="w-full relative">
                  <CarouselContent className="-ml-0">
                    {chunks.map((chunk, ci) => (
                      <CarouselItem key={ci} className="pl-0 basis-full">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 px-1">
                          {chunk.map((plan) => {
                     const costPrice = resellerPrices[plan.credits_amount] ?? (costs[plan.credits_amount] ?? plan.price_cents);
                     const salePrice = costPrice ? costPrice * 2 : 0;
                     const perCredit = costPrice ? costPrice / plan.credits_amount : 0;
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
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="hidden sm:flex" />
                  <CarouselNext className="hidden sm:flex" />
                  <div className="mt-4 flex justify-center gap-1.5 sm:hidden">
                    {chunks.map((_, i) => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    ))}
                  </div>
                </Carousel>
                  );
                })()
              )}

            </TabsContent>

            <TabsContent value="rules" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
              <div className="space-y-8">
                {/* Alerta principal */}
                <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-destructive/30 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent p-5 sm:p-6 md:p-8">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-destructive/20 blur-3xl pointer-events-none" />
                  <div className="relative flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive text-white shadow-lg shadow-destructive/30">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">Atenção</span>
                      <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Verifique os requisitos antes de continuar</h3>
                      <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-2xl">
                        Contas com determinados planos <span className="font-bold text-foreground">Pro</span> e <span className="font-bold text-foreground">Business</span> são compatíveis com nosso sistema de recarga de créditos. Confira abaixo os planos aceitos atualmente.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Planos compatíveis */}
                <div className="rounded-3xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between gap-4 p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold tracking-tight">Planos compatíveis</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">Valores mensais aceitos no sistema</p>
                      </div>
                    </div>
                    <span className="hidden md:inline-flex px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">Aceitos</span>
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
                    {[
                      { plan: "Plano Free", price: "Gratuito", tag: "Free", accent: "text-muted-foreground" },
                      { plan: "Pro — 20 créditos", price: "$5/mês", tag: "Pro" },
                      { plan: "Pro — 200 créditos", price: "$50/mês", tag: "Pro" },
                      { plan: "Pro — 400 créditos", price: "$100/mês", tag: "Pro" },
                      { plan: "Pro — 800 créditos", price: "$200/mês", tag: "Pro" },
                      { plan: "Pro — 10.000 créditos", price: "$2.250/mês", tag: "Pro" },
                      { plan: "Business — 100 créditos", price: "$50/mês", tag: "Business" },
                      { plan: "Business — 200 créditos", price: "$100/mês", tag: "Business" },
                      { plan: "Business — 400 créditos", price: "$200/mês", tag: "Business" },
                      { plan: "Business — 5.000 créditos", price: "$2.250/mês", tag: "Business" },
                    ].map((p, i) => (
                      <div key={i} className="bg-card p-5 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors">
                        <div className="min-w-0">
                          <span className={cn(
                            "inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider mb-1.5",
                            p.tag === "Pro" && "bg-primary/10 text-primary",
                            p.tag === "Business" && "bg-blue-500/10 text-blue-500",
                            p.tag === "Free" && "bg-muted text-muted-foreground"
                          )}>{p.tag}</span>
                          <p className="text-sm font-bold tracking-tight truncate">{p.plan}</p>
                        </div>
                        <span className={cn("text-sm font-black tracking-tight whitespace-nowrap", p.accent ?? "text-foreground")}>{p.price}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Limite diário */}
                <div className="rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-6 md:p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">Limite diário de recarga</h3>
                      <p className="text-[11px] text-muted-foreground font-medium">Quantos créditos cada plano libera por dia</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {[
                      { plan: "Pro — 20 créditos", limit: "200", unit: "créditos/dia", icon: MousePointer2, tag: "Pro" },
                      { plan: "Pro — 200 créditos ou superior", limit: "1.000", unit: "créditos/dia", icon: BarChart3, tag: "Pro+" },
                      { plan: "Business — qualquer plano", limit: "2.000", unit: "créditos/dia", icon: Network, tag: "Business" },
                    ].map((r, i) => (
                      <div key={i} className="group relative overflow-hidden rounded-2xl border border-border bg-background/60 p-5 hover:border-primary/40 transition-all">
                        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                        <div className="relative space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <r.icon className="h-4 w-4" />
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">{r.tag}</span>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{r.plan}</p>
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-display text-3xl font-black tracking-tighter">{r.limit}</span>
                              <span className="text-[11px] font-bold text-muted-foreground">{r.unit}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Importante + Confirmação */}
                <div className="grid lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 sm:p-6 md:p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Importante</span>
                        <h4 className="text-base font-bold tracking-tight">Pedidos acima do limite diário</h4>
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                          Pedidos realizados acima do limite diário do seu plano serão entregues automaticamente <span className="font-bold text-foreground">no dia seguinte, após 24 horas exatas</span>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl sm:rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 sm:p-6 md:p-8 flex flex-col justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Pronto pra começar</span>
                    </div>
                    <p className="text-sm font-bold tracking-tight leading-snug">
                      Ao continuar, você confirma que leu e concorda com as regras acima.
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Qualquer dúvida, estamos à disposição 🚀
                    </p>
                  </div>
                </div>
              </div>

            </TabsContent>

            <TabsContent value="api" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
              {(() => {
                const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reseller-credits-api`;
                const autoEndpoints = [
                  { method: "GET", path: "/status", desc: "Saúde da API" },
                  { method: "GET", path: "/saldo", desc: "Saldo atual" },
                  { method: "GET", path: "/pacotes", desc: "Pacotes disponíveis" },
                  { method: "GET", path: "/orcamento?creditos=100", desc: "Cotação prévia" },
                  { method: "POST", path: "/pedidos", desc: "Criar pedido automático" },
                  { method: "GET", path: "/pedidos", desc: "Listar pedidos" },
                  { method: "GET", path: "/pedidos/{id}", desc: "Consultar pedido" },
                  { method: "GET", path: "/transacoes", desc: "Histórico de saldo" },
                  { method: "GET", path: "/estatisticas?periodo=30d", desc: "Totais e ticket médio" },
                  { method: "GET", path: "/uso", desc: "Uso da sua API key" },
                ];
                const manualEndpoints = [
                  { method: "GET", path: "/manual/info", desc: "E-mail do bot e SLA" },
                  { method: "POST", path: "/pedidos-manual", desc: "Criar pedido manual" },
                  { method: "POST", path: "/pedidos-manual/{id}/convite", desc: "Confirmar convite" },
                  { method: "GET", path: "/pedidos-manual", desc: "Listar pedidos manuais" },
                  { method: "GET", path: "/pedidos-manual/{id}", desc: "Consultar pedido manual" },
                ];
                const fullAuto = `# API Recargas Automáticas — exemplos\n# URL base: ${API_BASE}\n# Header obrigatório: X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx\n\ncurl -X GET "${API_BASE}/saldo" \\\n  -H "X-API-Key: SUA_API_KEY"\n\ncurl -X POST "${API_BASE}/pedidos" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "creditos": 100,\n    "tipo_entrega": "workspace_proprio",\n    "workspace_id": "ws_xxx"\n  }'`;
                const fullManual = `# API Recargas Manuais — exemplos\n# URL base: ${API_BASE}\n# Header obrigatório: X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx (scope recharges_manual)\n\ncurl -X POST "${API_BASE}/pedidos-manual" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "creditos": 100,\n    "tipo_entrega": "workspace_proprio",\n    "workspace_name": "Meu Workspace"\n  }'\n\ncurl -X POST "${API_BASE}/pedidos-manual/UUID/convite" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "workspace_name": "Meu Workspace", "invite_status": "sent" }'`;
                return (
                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* API Automática (Revendedor) */}
                    <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-8 space-y-6 transition-all hover:border-primary/40">
                      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                            <Zap className="h-6 w-6" />
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Revendedores</span>
                            <h3 className="font-display text-2xl font-bold tracking-tight">API Automática</h3>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Online</span>
                      </div>

                      <p className="relative text-sm text-muted-foreground font-medium leading-relaxed">
                        Endpoints REST processados em tempo real. Saldo debitado na hora. Use o header <code className="font-mono text-primary">X-API-Key</code> em todas as requisições.
                      </p>

                      <div className="relative space-y-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL base</span>
                        </div>
                        <div className="p-4 rounded-xl bg-secondary border border-border font-mono text-[11px] break-all">
                          {API_BASE}
                        </div>
                      </div>

                      <div className="relative space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Endpoints disponíveis</span>
                        </div>
                        <div className="rounded-xl border border-border overflow-hidden">
                          {autoEndpoints.map((e, i) => (
                            <div key={i} className={cn("flex items-center gap-3 px-3 py-2.5 text-xs", i !== autoEndpoints.length - 1 && "border-b border-border")}>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md font-mono text-[9px] font-black tracking-wider shrink-0 w-12 text-center",
                                e.method === "GET" ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
                              )}>{e.method}</span>
                              <code className="font-mono text-[11px] text-foreground truncate">{e.path}</code>
                              <span className="ml-auto text-[10px] text-muted-foreground truncate hidden sm:inline">{e.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="relative flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" className="h-10 px-4 rounded-xl text-xs font-bold" asChild>
                          <a href="/docs/apis-revendedor.pdf" target="_blank" rel="noopener noreferrer">
                            <FileDown className="h-3.5 w-3.5 mr-2" /> PDF
                          </a>
                        </Button>
                        <Button className="h-10 px-4 rounded-xl bg-primary text-white text-xs font-bold" onClick={() => { navigator.clipboard?.writeText(API_BASE); toast.success("URL base copiada!"); }}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> URL base
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-10 px-4 rounded-xl text-xs font-bold"
                          onClick={() => { navigator.clipboard?.writeText(fullAuto); toast.success("Cópia completa copiada!"); }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-2" /> Cópia completa
                        </Button>
                      </div>
                    </div>

                    {/* API Manual */}
                    <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-8 space-y-6 transition-all hover:border-amber-500/40">
                      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
                            <Hand className="h-6 w-6" />
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Suporte humano</span>
                            <h3 className="font-display text-2xl font-bold tracking-tight">API Manual</h3>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">SLA 24h</span>
                      </div>

                      <p className="relative text-sm text-muted-foreground font-medium leading-relaxed">
                        Fluxo manual processado pela equipe. Exige <strong>chave separada</strong> (scope <code className="font-mono text-amber-500">recharges_manual</code>). Saldo debitado na hora; entrega em até 24h.
                      </p>

                      <div className="relative space-y-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL base</span>
                        </div>
                        <div className="p-4 rounded-xl bg-secondary border border-border font-mono text-[11px] break-all">
                          {API_BASE}
                        </div>
                      </div>

                      <div className="relative space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Endpoints disponíveis</span>
                        </div>
                        <div className="rounded-xl border border-border overflow-hidden">
                          {manualEndpoints.map((e, i) => (
                            <div key={i} className={cn("flex items-center gap-3 px-3 py-2.5 text-xs", i !== manualEndpoints.length - 1 && "border-b border-border")}>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md font-mono text-[9px] font-black tracking-wider shrink-0 w-12 text-center",
                                e.method === "GET" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                              )}>{e.method}</span>
                              <code className="font-mono text-[11px] text-foreground truncate">{e.path}</code>
                              <span className="ml-auto text-[10px] text-muted-foreground truncate hidden sm:inline">{e.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="relative space-y-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-amber-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fluxo em 4 passos</span>
                        </div>
                        <ul className="space-y-1.5">
                          {[
                            "Crie o pedido — POST /pedidos-manual",
                            "Convide recarga@lovconnect.store como editor do workspace",
                            "Confirme — POST /pedidos-manual/{id}/convite",
                            "Acompanhe — GET /pedidos-manual/{id}",
                          ].map((step, i) => (
                            <li key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-background/40 border border-border">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500 text-[10px] font-black">{i + 1}</span>
                              <span className="text-[11px] font-medium text-foreground/90 leading-snug">{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="relative flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" className="h-10 px-4 rounded-xl text-xs font-bold border-amber-500/40 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600" asChild>
                          <a href="/docs/apis-revendedor.pdf" target="_blank" rel="noopener noreferrer">
                            <FileDown className="h-3.5 w-3.5 mr-2" /> PDF
                          </a>
                        </Button>
                        <Button className="h-10 px-4 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-500/90" onClick={() => { navigator.clipboard?.writeText(API_BASE); toast.success("URL base copiada!"); }}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> URL base
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-10 px-4 rounded-xl text-xs font-bold"
                          onClick={() => { navigator.clipboard?.writeText(fullManual); toast.success("Cópia completa copiada!"); }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-2" /> Cópia completa
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* 
          DOCK NAVIGATION - ULTRA MINIMALIST 
      */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-6 md:hidden">
        <div className="bg-background border border-border p-2 rounded-2xl shadow-xl flex items-center justify-between">
          <Link to="/painel/revendedor" className="flex h-12 w-12 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-all">
            <LayoutDashboard className="h-5 w-5" />
          </Link>
          
          <div className="flex bg-secondary rounded-xl p-1 gap-1">
            <Link to="/painel/revendedor/licencas" className="flex items-center gap-2 px-4 h-10 rounded-lg text-muted-foreground hover:text-foreground transition-all font-semibold text-[11px]">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Vendas</span>
            </Link>
            <Link to="/painel/revendedor/recargas" className="flex items-center gap-2 px-6 h-10 rounded-lg bg-primary text-white shadow-md transition-all font-semibold text-[11px]">
              <Zap className="h-4 w-4" />
              <span>Recargas</span>
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
        costPrice={modalPlan ? (resellerPrices[modalPlan.credits_amount] ?? costs[modalPlan.credits_amount] ?? modalPlan.price_cents) : 0}
        balance={balance}
        onSuccess={refreshBalance}
        mode={activeMode}
      />
    </div>
  );
}
