import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Users,
  Package,
  ShieldCheck,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  PlusCircle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  CreditCard,
  Crown,
  Loader2,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  History as HistoryIcon,
  LayoutDashboard,
  FileText,
  Terminal,
  Coins,
  Megaphone,
  Heart,
  Infinity as InfinityIcon,
  Star,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Label,
} from "recharts";
import { format, subDays, startOfDay, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const LICENSE_LABELS: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  completed: "Concluído",
  failed: "Falhou",
  refunded: "Reembolsado",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/40",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/40",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
  refunded: "bg-muted text-muted-foreground border-border",
};

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#3b82f6", "#a855f7", "#ef4444"];

type ActivityItem = {
  id: string;
  type: "sale" | "recharge";
  title: string;
  amount_cents: number;
  status: string;
  created_at: string;
  metadata?: any;
};

export default function RevendedorDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [tier, setTier] = useState<{ name: string; color: string } | null>(null);
  const [nextTier, setNextTier] = useState<{ name: string; min_spent_cents: number } | null>(null);

  const [stats, setStats] = useState({
    clients: 0,
    activeLicenses: 0,
    failedOrders: 0,
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [avisos, setAvisos] = useState<any[]>([]);
  const [extMap, setExtMap] = useState<Record<string, string>>({});
  const [clientMap, setClientMap] = useState<Record<string, string>>({});

  const [integrations, setIntegrations] = useState<{
    misticpay_enabled: boolean;
    evolution_status: string;
  }>({ misticpay_enabled: false, evolution_status: "disconnected" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
      const { data: r } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!r || cancelled) {
        setLoading(false);
        return;
      }
      setResellerId(r.id);

      const since = subDays(new Date(), 30).toISOString();

      const [
        balanceRes,
        tierStateRes,
        tierRes,
        tiersRes,
        clientsRes,
        licensesRes,
        failedRes,
        ordersRes,
        rechargesRes,
        integRes,
        announcementsRes,
      ] = await Promise.all([
        supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
        supabase.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", r.id).maybeSingle(),
        supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
        supabase.from("reseller_tiers").select("name,min_spent_cents,is_active").eq("is_active", true).order("min_spent_cents", { ascending: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("reseller_id", r.id),
        supabase.from("client_extensions").select("*", { count: "exact", head: true }).eq("reseller_id", r.id).eq("status", "active"),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("reseller_id", r.id).eq("is_test", false).in("status", ["failed", "refunded"]),
        supabase.from("orders").select("id,license_type,price_cents,status,created_at,client_id,extension_id,is_test,notes").eq("reseller_id", r.id).gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("reseller_credit_purchases").select("id,credits,price_cents,status,created_at").eq("reseller_id", r.id).gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("reseller_integrations").select("misticpay_enabled,connection_status").eq("reseller_id", r.id).maybeSingle(),
        supabase.from("announcements").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(5),
      ]);

      if (cancelled) return;

      setBalance(balanceRes.data?.balance_cents ?? 0);
      const spent = tierStateRes.data?.total_spent_cents ?? 0;
      setTotalSpent(spent);

      const t: any = Array.isArray(tierRes.data) ? tierRes.data[0] : tierRes.data;
      if (t) setTier({ name: t.name, color: t.color });

      const tiers = (tiersRes.data ?? []) as { name: string; min_spent_cents: number }[];
      const next = tiers.find((x) => x.min_spent_cents > spent);
      setNextTier(next ?? null);

      const ords = (ordersRes.data ?? []) || [];
      const recharges = (rechargesRes.data ?? []) || [];

      const combinedActivities: ActivityItem[] = [
        ...ords.map((o: any) => ({
          id: o.id,
          type: "sale" as const,
          title: "Venda",
          amount_cents: o.price_cents,
          status: o.status,
          created_at: o.created_at,
          metadata: {
            extension_id: o.extension_id,
            license_type: o.license_type,
            is_test: o.is_test
          }
        })),
        ...recharges.map((rc: any) => ({
          id: rc.id,
          type: "recharge" as const,
          title: `Recargas de ${rc.credits} recargas`,
          amount_cents: rc.price_cents,
          status: rc.status,
          created_at: rc.created_at
        }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActivities(combinedActivities);

      setAvisos(announcementsRes.data ?? []);
      setStats({
        clients: clientsRes.count ?? 0,
        activeLicenses: licensesRes.count ?? 0,
        failedOrders: failedRes.count ?? 0,
      });

      setIntegrations({
        misticpay_enabled: integRes.data?.misticpay_enabled ?? false,
        evolution_status: integRes.data?.connection_status ?? "disconnected",
      });

      // Mapeia ids -> nome para a lista de pedidos
      const extIds = Array.from(new Set(ords.map((o: any) => o.extension_id).filter(Boolean))) as string[];
      const cliIds = Array.from(new Set(ords.map((o: any) => o.client_id).filter(Boolean))) as string[];
      const [extData, cliData] = await Promise.all([
        extIds.length
          ? supabase.from("extensions").select("id,name").in("id", extIds)
          : Promise.resolve({ data: [] as any[] }),
        cliIds.length
          ? supabase.from("profiles").select("id,display_name,email").in("id", cliIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      setExtMap(Object.fromEntries((extData.data ?? []).map((e: any) => [e.id, e.name])));
      setClientMap(
        Object.fromEntries(
          (cliData.data ?? []).map((p: any) => [p.id, p.display_name || p.email || "Cliente"]),
        ),
      );
      } catch (e) {
        console.error("[RevendedorDashboard] load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Agregações
  const completed = useMemo(() => activities.filter((a) => a.status === "completed" && !(a.type === "sale" && a.metadata?.is_test)), [activities]);

  const salesWindow = (days: number) => {
    const cutoff = subDays(new Date(), days);
    const list = completed.filter((a) => isAfter(new Date(a.created_at), cutoff));
    return {
      count: list.length,
      cents: list.reduce((s, a) => s + a.amount_cents, 0),
    };
  };

  const today = useMemo(() => {
    const start = startOfDay(new Date());
    const list = completed.filter((a) => isAfter(new Date(a.created_at), start));
    return { count: list.length, cents: list.reduce((s, a) => s + a.amount_cents, 0) };
  }, [completed]);
  const last7 = useMemo(() => salesWindow(7), [completed]); // eslint-disable-line react-hooks/exhaustive-deps
  const last30 = useMemo(() => salesWindow(30), [completed]); // eslint-disable-line react-hooks/exhaustive-deps

  const dailySales = useMemo(() => {
    const days: { date: string; label: string; receita: number; vendas: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({
        date: d.toISOString(),
        label: format(d, "dd/MM", { locale: ptBR }),
        receita: 0,
        vendas: 0,
      });
    }
    completed.forEach((a) => {
      const d = startOfDay(new Date(a.created_at)).toISOString();
      const slot = days.find((x) => x.date === d);
      if (slot) {
        slot.receita += a.amount_cents / 100;
        slot.vendas += 1;
      }
    });
    return days;
  }, [completed]);

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    completed.forEach((a) => {
      if (a.type === "sale" && a.metadata?.license_type) {
        const type = a.metadata.license_type;
        map[type] = (map[type] ?? 0) + 1;
      } else if (a.type === "recharge") {
        map["recharge"] = (map["recharge"] ?? 0) + 1;
      }
    });
    return Object.entries(map)
      .map(([k, v]) => ({ 
        name: k === "recharge" ? "Recargas de Recargas" : (LICENSE_LABELS[k] ?? k), 
        value: v 
      }))
      .sort((a, b) => b.value - a.value);
  }, [completed]);

  const topExtensions = useMemo(() => {
    const map: Record<string, number> = {};
    completed.forEach((a) => {
      if (a.type !== "sale" || !a.metadata?.extension_id) return;
      const extId = a.metadata.extension_id;
      map[extId] = (map[extId] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([id, v]) => ({ name: extMap[id] ?? "Sem extensão", vendas: v }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 5);
  }, [completed, extMap]);

  const tierProgress = useMemo(() => {
    if (!nextTier || nextTier.min_spent_cents <= 0) return null;
    const pct = Math.min(100, Math.round((totalSpent / nextTier.min_spent_cents) * 100));
    return { pct, remaining: Math.max(0, nextTier.min_spent_cents - totalSpent) };
  }, [nextTier, totalSpent]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!resellerId) {
    return (
      <div>
        <PageHeader title="Painel do Revendedor" description="Sua operação em um só lugar." />
        <div className="rounded-xl border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Sua conta de revendedor ainda não foi configurada.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* HERO Dashboard Geral */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-background">
        {/* grid sutil de fundo */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        {/* auroras decorativas */}
        <div
          className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-50 pointer-events-none blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 65%)" }}
        />
        <div
          className="absolute -left-40 -bottom-40 h-[460px] w-[460px] rounded-full opacity-40 pointer-events-none blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(160 84% 39% / 0.25), transparent 65%)" }}
        />
        {/* anel decorativo lado direito */}
        <div className="absolute right-6 top-6 hidden lg:block pointer-events-none">
          <div className="relative h-44 w-44">
            <div className="absolute inset-0 rounded-full border border-primary/20" />
            <div className="absolute inset-3 rounded-full border border-primary/15" />
            <div className="absolute inset-6 rounded-full border border-primary/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur shadow-red-glow">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative p-6 md:p-10">
          <div className="space-y-7">
            <div className="flex items-center gap-3 text-[10px] md:text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
              <span className="text-border">·</span>
              <span>Painel do Revendedor</span>
              {tier && (
                <>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-primary normal-case tracking-normal">
                    <Crown className="h-3 w-3" /> {tier.name}
                  </span>
                </>
              )}
            </div>

            <div>
              <h1 className="font-display text-4xl md:text-6xl font-black leading-[0.95] tracking-tighter">
                Dashboard
                <br />
                <span className="italic text-primary">Geral.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm md:text-base text-muted-foreground leading-relaxed">
                Monitoramento em tempo real da sua operação. Vendas, recargas e licenças numa única interface.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="rounded-xl shadow-red-glow">
                <Link to="/painel/revendedor/recargas">
                  <Zap className="mr-2 h-4 w-4" /> Centro de Abastecimento
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-xl">
                <Link to="/painel/revendedor/pedidos">
                  <ShoppingCart className="mr-2 h-4 w-4" /> Licenças
                </Link>
              </Button>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-background/60 backdrop-blur p-4 transition hover:border-emerald-500/40">
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
                <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500" /> Hoje
                </div>
                <div className="relative mt-2 font-display text-2xl font-black text-emerald-500">
                  {fmtBRL(today.cents)}
                </div>
                <div className="relative text-[10px] text-muted-foreground mt-0.5">{today.count} pedidos</div>
              </div>
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-background/60 backdrop-blur p-4 transition hover:border-primary/40">
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
                <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Wallet className="h-3 w-3 text-primary" /> Saldo
                </div>
                <div className="relative mt-2 font-display text-2xl font-black">{fmtBRL(balance)}</div>
                <div className="relative text-[10px] text-muted-foreground mt-0.5">disponível</div>
              </div>
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-background/60 backdrop-blur p-4 transition hover:border-blue-500/40">
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-500/10 blur-2xl" />
                <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3 w-3 text-blue-500" /> Rede
                </div>
                <div className="relative mt-2 font-display text-2xl font-black">{stats.clients}</div>
                <div className="relative text-[10px] text-muted-foreground mt-0.5">clientes</div>
              </div>
              <div className="group relative overflow-hidden rounded-2xl border border-border bg-background/60 backdrop-blur p-4 transition hover:border-amber-500/40">
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber-500/10 blur-2xl" />
                <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-amber-500" /> Licenças
                </div>
                <div className="relative mt-2 font-display text-2xl font-black">{stats.activeLicenses}</div>
                <div className="relative text-[10px] text-muted-foreground mt-0.5">ativas</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="grid gap-3 mb-6">
          {avisos.map((aviso) => (
            <div key={aviso.id} className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-3 md:p-4 flex items-start gap-3 md:gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow-sm">
                <Megaphone className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-sm md:text-base text-foreground truncate">{aviso.title}</h4>
                  <span className="text-[8px] md:text-[10px] font-bold text-muted-foreground uppercase whitespace-nowrap">
                    {format(new Date(aviso.created_at), "dd MMM", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 mt-1">{aviso.content}</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-auto p-2 text-primary hover:bg-primary/10">
                <Link to="/painel/revendedor/avisos">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* TOPO: saldo / nível */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Card de Saldo Premium */}
        <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 md:p-5 transition-all duration-300 hover:shadow-md">
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wallet className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                <span className="text-xs md:text-sm font-bold">Saldo</span>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 md:h-8 px-2 text-[10px] md:text-xs text-primary">
                <Link to="/painel/revendedor/adicionar-saldo">Recarregar</Link>
              </Button>
            </div>
            
            <div className="font-display text-2xl md:text-3xl font-black tracking-tight text-primary">
              {fmtBRL(balance)}
            </div>
          </div>
        </div>

        {/* Card de Nível Evolutivo */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 md:p-5 transition-all duration-300 hover:shadow-md">
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <Crown className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                <span className="text-xs md:text-sm font-bold">{tier?.name || "Iniciante"}</span>
              </div>
            </div>

            {tierProgress && nextTier ? (
              <div className="space-y-1.5 md:space-y-2">
                <div className="flex items-center justify-between text-[8px] md:text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                  <span>Próximo: {nextTier.name}</span>
                  <span>{tierProgress.pct}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-1000"
                    style={{ width: `${tierProgress.pct}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-[10px] md:text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Nível Máximo
              </div>
            )}
          </div>
        </div>

        {/* Card de Investimento */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 md:p-5 transition-all duration-300 hover:shadow-md">
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                <span className="text-xs md:text-sm font-bold">Investimento</span>
              </div>
            </div>
            
            <div className="font-display text-2xl md:text-3xl font-black tracking-tight">
              {fmtBRL(totalSpent)}
            </div>
          </div>
        </div>
      </div>

      {/* INDICADORES RÁPIDOS */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Hoje", count: today.count, cents: today.cents, icon: Zap, color: "text-primary", bg: "bg-primary/5" },
          { label: "7 dias", count: last7.count, cents: last7.cents, icon: Activity, color: "text-blue-500", bg: "bg-blue-500/5" },
          { label: "30 dias", count: last30.count, cents: last30.cents, icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/5" },
          { label: "Ativas", count: stats.activeLicenses, cents: null, icon: ShieldCheck, color: "text-purple-500", bg: "bg-purple-500/5" }
        ].map((item, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("p-1.5 rounded-lg", item.bg, item.color)}>
                <item.icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{item.label}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black">{item.count}</span>
              {item.cents !== null && (
                <span className="text-[10px] font-bold text-muted-foreground">{fmtBRL(item.cents)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* GRÁFICOS */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 md:p-6 md:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Receita (30d)
            </h3>
            <div className="text-right">
              <span className="text-[8px] md:text-[10px] font-bold uppercase text-muted-foreground tracking-widest block">Total</span>
              <span className="text-lg md:text-xl font-black text-primary">{fmtBRL(last30.cents)}</span>
            </div>
          </div>

          <div className="h-48 md:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="receita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" fill="url(#receita)" strokeWidth={2} name="Receita" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
          <h3 className="text-base md:text-lg font-bold flex items-center gap-2 mb-4 md:mb-6">
            <Package className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Mix de Planos
          </h3>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                >
                  {byType.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {byType.slice(0, 4).map((b, i) => (
              <div key={b.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground font-medium">{b.name}</span>
                </div>
                <span className="font-bold">{b.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ÚLTIMAS ATIVIDADES */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-1 lg:col-span-2 rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Atividades Recentes
            </h3>
            <Button asChild variant="ghost" size="sm" className="h-7 md:h-8 px-2 text-[10px] md:text-xs text-primary">
              <Link to="/painel/revendedor/pedidos">Ver tudo</Link>
            </Button>
          </div>

          <div className="space-y-2 md:space-y-3">
            {activities.length === 0 ? (
              <div className="py-8 md:py-12 text-center text-xs md:text-sm text-muted-foreground">Nenhuma atividade registrada.</div>
            ) : (
              activities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-2.5 md:p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                    <div className={cn(
                      "flex h-7 w-7 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-lg",
                      activity.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                    )}>
                      {activity.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4" /> : <XCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm font-bold truncate">
                        {activity.type === 'sale' ? (extMap[activity.metadata?.extension_id || ""] || activity.title) : activity.title}
                      </div>
                      <div className="text-[9px] md:text-[10px] text-muted-foreground">{format(new Date(activity.created_at), "dd MMM, HH:mm", { locale: ptBR })}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs md:text-sm font-bold">{fmtBRL(activity.amount_cents)}</div>
                    <div className={cn("text-[9px] md:text-[10px] font-bold uppercase", activity.status === 'completed' ? "text-emerald-500" : "text-destructive")}>
                      {STATUS_LABELS[activity.status] || activity.status}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <h3 className="text-base md:text-lg font-bold flex items-center gap-2 mb-4 md:mb-6">
              <ShieldCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Integrações
            </h3>
            <div className="space-y-3">
              <IntegrationRow 
                icon={CreditCard} 
                title="MisticPay" 
                subtitle="Pagamentos PIX" 
                ok={integrations.misticpay_enabled} 
                href="/painel/revendedor/integracoes/misticpay" 
              />
              <IntegrationRow 
                icon={MessageSquare} 
                title="WhatsApp" 
                subtitle="Evolution API" 
                ok={integrations.evolution_status === "connected"} 
                href="/painel/revendedor/integracoes/evolution" 
              />
            </div>
          </div>

          <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
            <div className="flex items-center gap-2 mb-2 text-primary">
              <Zap className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Status do Sistema</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Clusters operando em alta disponibilidade. Nenhuma instabilidade detectada nas últimas 24 horas.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}

function ProcessingStep({ 
  title, 
  description, 
  status, 
  time, 
  isLast 
}: { 
  title: string; 
  description: string; 
  status: 'success' | 'error'; 
  time?: string; 
  isLast?: boolean 
}) {
  return (
    <div className="relative">
      <div className={cn(
        "absolute -left-[23px] top-1 h-4 w-4 rounded-full border-2 border-black z-10",
        status === 'success' ? "bg-emerald-500" : "bg-destructive"
      )} />
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-white">{title}</h4>
          <p className="mt-1 text-[10px] text-muted-foreground font-medium leading-relaxed">{description}</p>
        </div>
        {time && <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">{time}</span>}
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function IntegrationRow({
  icon: Icon,
  title,
  subtitle,
  ok,
  href,
}: {
  icon: any;
  title: string;
  subtitle: string;
  ok: boolean;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-4 rounded-2xl border border-border bg-background/40 p-4 transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-sm group"
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all group-hover:scale-110",
          ok ? "bg-emerald-500/10 text-emerald-500 shadow-emerald-500/10" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate group-hover:text-primary transition-colors">{title}</div>
        <div className="text-[11px] text-muted-foreground font-medium truncate">{subtitle}</div>
      </div>
      <div className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border",
        ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-muted/30 text-muted-foreground"
      )}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      </div>
    </Link>
  );
}
