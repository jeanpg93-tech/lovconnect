import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard } from "@/components/painel/PageHeader";
import {
  Package,
  Store,
  Users,
  ShieldCheck,
  ShieldAlert,
  ShoppingCart,
  Wallet,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Filter,
  Check,
  ChevronRight,
  Database,
  Loader2,
  Search,
  Settings2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Store as StoreIcon,
  Hand,
  BarChart3,
  Globe,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Stats = {
  ext: number;
  rev: number;
  clients: number;
  licenses: number;
  ordersTotal: number;
  ordersCompleted: number;
  ordersFailed: number;
  ordersPending: number;
  ordersTest: number;
  revenueCents: number;
  rechargeTotalCents: number;
  rechargePaidCount: number;
  storefrontsActive: number;
  reportsPending: number;
  ordersToday: number;
  revenueToday: number;
};

type RecentOrder = {
  id: string;
  created_at: string;
  status: string;
  is_test: boolean;
  license_type: string;
  price_cents: number;
  reseller_name?: string;
  extension_name?: string;
  api_key_id?: string | null;
  error_message?: string | null;
  kind: 'order' | 'storefront' | 'recharge';
  buyer_name?: string | null;
};

type TopReseller = {
  id: string;
  display_name: string;
  total_cents: number;
  orders_count: number;
};

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(',', ' -');

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    completed: { label: "OK", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
    pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", Icon: Clock },
    failed: { label: "Falha", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  };
  const it = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground", Icon: AlertCircle };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${it.cls}`}>
      <it.Icon className="h-3 w-3" />
      {it.label}
    </span>
  );
};

export default function GerenteDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("all");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [stats, setStats] = useState<Stats & { totalOrders: number; totalApiLogs: number }>({
    ext: 0, rev: 0, clients: 0, licenses: 0,
    ordersTotal: 0, ordersCompleted: 0, ordersFailed: 0, ordersPending: 0, ordersTest: 0,
    revenueCents: 0, revenueToday: 0, ordersToday: 0,
    rechargeTotalCents: 0, rechargePaidCount: 0,
    storefrontsActive: 0, reportsPending: 0,
    totalOrders: 0, totalApiLogs: 0
  });
  const [gatewayBalance, setGatewayBalance] = useState<string>("R$ 0,00");
  const [providerBalance, setProviderBalance] = useState<string>("R$ 0,00");
  const [todayRecharge, setTodayRecharge] = useState<{ cents: number; count: number }>({ cents: 0, count: 0 });
  const [creditMovements, setCreditMovements] = useState<{ id: string; created_at: string; amount_cents: number; kind: string; description: string | null; reseller_name: string }[]>([]);
  const [apiLogs, setApiLogs] = useState<{ id: string; created_at: string; endpoint: string; reseller_name?: string; status_code: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [topResellers, setTopResellers] = useState<TopReseller[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [apiLogPage, setApiLogsPage] = useState(1);
  const [isRecentOrdersExpanded, setIsRecentOrdersExpanded] = useState(false);
  const [isApiLogsExpanded, setIsApiLogsExpanded] = useState(false);
  const ITEMS_PER_PAGE = 10;

  const withTimeout = <T,>(p: Promise<T>, ms = 8000, fallback: any = { data: null, error: null }): Promise<T> =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback as T), ms))]);

  const fetchStats = async () => {
    try {
    setLoading(true);
    let startDate: string | null = null;
    let endDate: string | null = null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === "today") {
      startDate = today.toISOString();
    } else if (period === "week") {
      startDate = subDays(today, 7).toISOString();
    } else if (period === "month") {
      startDate = startOfMonth(today).toISOString();
    } else if (period === "last_month") {
      const lastMonth = subMonths(today, 1);
      startDate = startOfMonth(lastMonth).toISOString();
      endDate = endOfMonth(lastMonth).toISOString();
    } else if (period === "custom" && customRange.from) {
      startDate = customRange.from.toISOString();
      if (customRange.to) {
        endDate = customRange.to.toISOString();
      }
    }

    const todayIsoEarly = today.toISOString();

    const [ext, rev, clients, storefronts, reports, provUsage, ordersAll, balanceRes, providerBalanceRes, todayRechargesRes, creditMovesRes] = await Promise.all([
      supabase.from("extensions").select("*", { count: "exact", head: true }),
      supabase.from("resellers").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("profiles").select("*", { count: "exact", head: true }).not("reseller_id", "is", null),
      supabase.from("reseller_storefronts").select("*", { count: "exact", head: true }).eq("is_enabled", true),
      supabase.from("storefront_reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
      withTimeout(supabase.functions.invoke("provider-api?action=usage-all") as any, 8000, { data: { usage: [] }, error: null }),
      supabase.from("orders").select("price_cents, is_test, status, created_at, reseller_id"),
      withTimeout(supabase.functions.invoke("provider-api?action=gateway-balance") as any, 8000, { data: null, error: null }),
      withTimeout(supabase.functions.invoke("lovable-credits-api?action=balance", { method: "GET" }) as any, 8000, { data: null, error: null }),
      supabase.from("recharge_intents").select("amount_cents").not("paid_at", "is", null).gte("paid_at", todayIsoEarly),
      supabase.from("balance_transactions").select("id, created_at, amount_cents, kind, description, reseller_id").order("created_at", { ascending: false }).limit(100),
    ]);

    const balanceAny: any = balanceRes;
    const provUsageAny: any = provUsage;
    const ordersAllAny: any = ordersAll;
    if (balanceAny?.data?.balance) {
      setGatewayBalance(formatBRL(Number(balanceAny.data.balance) * 100));
    }

    const provBal: any = providerBalanceRes;
    const provSaldo = provBal?.data?.data?.saldoReais ?? provBal?.data?.saldoReais ??
      (provBal?.data?.data?.saldoCentavos != null ? provBal.data.data.saldoCentavos / 100 : null);
    if (provSaldo != null) {
      setProviderBalance(`R$ ${Number(provSaldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    }

    const todayRechList = (todayRechargesRes as any)?.data ?? [];
    setTodayRecharge({
      cents: todayRechList.reduce((s: number, r: any) => s + Number(r.amount_cents ?? 0), 0),
      count: todayRechList.length,
    });


    // Orders filters for revenue and counts (filtered by period)
    let filteredOrders = ordersAllAny.data || [];
    let rechargeQuery = supabase.from("recharge_intents").select("amount_cents, status, created_at").eq("status", "paid");

    if (startDate) {
      filteredOrders = filteredOrders.filter(o => o.created_at >= startDate);
      rechargeQuery = rechargeQuery.gte("created_at", startDate);
    }
    if (endDate) {
      filteredOrders = filteredOrders.filter(o => o.created_at <= endDate);
      rechargeQuery = rechargeQuery.lte("created_at", endDate);
    }

    const { data: rechargeData } = await rechargeQuery;
    const rechargeItems = rechargeData || [];

    const completedOrders = filteredOrders.filter(o => o.status === "completed" && !o.is_test);
    const revenueCents = completedOrders.reduce((s, o) => s + (o.price_cents ?? 0), 0);
    const rechargeTotalCents = rechargeItems.reduce((s, r) => s + Number(r.amount_cents ?? 0), 0);
    
    const todayIso = today.toISOString();
    const ordersTodayList = (ordersAllAny.data || []).filter(o => o.created_at >= todayIso && !o.is_test);
    const ordersTodayCount = ordersTodayList.length;
    const revenueToday = ordersTodayList.filter(o => o.status === "completed").reduce((s, o) => s + (o.price_cents ?? 0), 0);

    const providerUsage = provUsageAny?.data?.usage || [];
    const totalProviderLicenses = providerUsage.length;

    // Recent activity: orders + storefront sales + recharges (merged)
    const FETCH_LIMIT = 100;
    const [ordersRes, storefrontRes, rechargesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id,created_at,status,is_test,license_type,price_cents,reseller_id,extension_id,api_key_id,error_message")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("storefront_orders")
        .select("id,created_at,status,license_type,price_cents,reseller_id,extension_id,error_message,buyer_name,product_type,credit_amount")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("recharge_intents")
        .select("id,created_at,status,amount_cents,reseller_id,payer_name,paid_at")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
    ]);

    // API Logs (nós com provedor e revendedor com nós)
    const { data: usageLogsData, count: apiLogsCountVal } = await supabase
      .from("reseller_api_usage")
      .select("id, created_at, endpoint, status_code, reseller_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((apiLogPage - 1) * ITEMS_PER_PAGE, apiLogPage * ITEMS_PER_PAGE - 1);

    const ordersData: any[] = ordersRes.data ?? [];
    const storefrontData: any[] = storefrontRes.data ?? [];
    const rechargesData: any[] = rechargesRes.data ?? [];

    const allResellerIds = [...new Set([
      ...ordersData.map(o => o.reseller_id),
      ...storefrontData.map(o => o.reseller_id),
      ...rechargesData.map(o => o.reseller_id),
    ].filter(Boolean))];
    const allExtIds = [...new Set([
      ...ordersData.map(o => o.extension_id),
      ...storefrontData.map(o => o.extension_id),
    ].filter(Boolean))];

    const [{ data: rs }, { data: es }] = await Promise.all([
      allResellerIds.length
        ? supabase.from("resellers").select("id,display_name").in("id", allResellerIds)
        : Promise.resolve({ data: [] as any[] }),
      allExtIds.length
        ? supabase.from("extensions").select("id,name").in("id", allExtIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const rMap = new Map((rs ?? []).map((r: any) => [r.id, r.display_name]));
    const eMap = new Map((es ?? []).map((e: any) => [e.id, e.name]));

    const merged: RecentOrder[] = [
      ...ordersData.map((o: any) => ({
        id: `o:${o.id}`,
        created_at: o.created_at,
        status: o.status,
        is_test: o.is_test,
        license_type: o.license_type,
        price_cents: o.price_cents ?? 0,
        reseller_name: rMap.get(o.reseller_id) ?? "—",
        extension_name: eMap.get(o.extension_id) ?? "—",
        api_key_id: o.api_key_id,
        error_message: o.error_message,
        kind: 'order' as const,
      })),
      ...storefrontData.map((o: any) => ({
        id: `s:${o.id}`,
        created_at: o.created_at,
        status: o.status === 'paid' ? 'completed' : o.status,
        is_test: false,
        license_type: o.product_type === 'credit' ? `${o.credit_amount ?? ''} recargas` : (o.license_type || 'loja'),
        price_cents: Number(o.price_cents ?? 0),
        reseller_name: rMap.get(o.reseller_id) ?? "—",
        extension_name: eMap.get(o.extension_id) ?? "—",
        api_key_id: null,
        error_message: o.error_message,
        kind: 'storefront' as const,
        buyer_name: o.buyer_name,
      })),
      ...rechargesData.map((r: any) => ({
        id: `r:${r.id}`,
        created_at: r.created_at,
        status: r.status === 'paid' || r.paid_at ? 'completed' : r.status,
        is_test: false,
        license_type: 'Recargas PIX',
        price_cents: Number(r.amount_cents ?? 0),
        reseller_name: rMap.get(r.reseller_id) ?? "—",
        extension_name: '—',
        api_key_id: null,
        error_message: null,
        kind: 'recharge' as const,
        buyer_name: r.payer_name,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));

    const totalRecent = merged.length;
    const pagedRecent = merged.slice((orderPage - 1) * ITEMS_PER_PAGE, orderPage * ITEMS_PER_PAGE);
    setRecentOrders(pagedRecent);

    // Movimentações de crédito (entradas e saídas) do sistema inteiro
    const movesData: any[] = (creditMovesRes as any)?.data ?? [];
    const moveResIds = [...new Set(movesData.map((m: any) => m.reseller_id).filter(Boolean))];
    const missingMoveIds = moveResIds.filter((id) => !rMap.has(id));
    let moveNameMap = rMap;
    if (missingMoveIds.length) {
      const { data: extraRs } = await supabase.from("resellers").select("id,display_name").in("id", missingMoveIds);
      moveNameMap = new Map(rMap);
      (extraRs ?? []).forEach((r: any) => moveNameMap.set(r.id, r.display_name));
    }
    setCreditMovements(
      movesData.map((m: any) => ({
        id: m.id,
        created_at: m.created_at,
        amount_cents: Number(m.amount_cents ?? 0),
        kind: m.kind,
        description: m.description,
        reseller_name: moveNameMap.get(m.reseller_id) ?? "—",
      })),
    );


    setStats({
      ext: ext.count ?? 0,
      rev: rev.count ?? 0,
      clients: clients.count ?? 0,
      licenses: totalProviderLicenses,
      ordersTotal: filteredOrders.length,
      ordersCompleted: completedOrders.length,
      ordersFailed: 0,
      ordersPending: filteredOrders.filter(o => o.status === "pending").length,
      ordersTest: 0,
      revenueCents,
      rechargeTotalCents,
      rechargePaidCount: rechargeItems.length,
      storefrontsActive: storefronts.count ?? 0,
      reportsPending: reports.count ?? 0,
      ordersToday: ordersTodayCount,
      revenueToday,
      totalOrders: totalRecent,
      totalApiLogs: apiLogsCountVal || 0,
    });


    // Top resellers (by spent in period)
    let topQuery = supabase.from("orders").select("reseller_id, price_cents").eq("status", "completed").eq("is_test", false);
    if (startDate) topQuery = topQuery.gte("created_at", startDate);
    if (endDate) topQuery = topQuery.lte("created_at", endDate);

    const { data: periodOrders } = await topQuery;
    
    if (periodOrders && periodOrders.length > 0) {
      const spendMap = new Map<string, { total: number, count: number }>();
      periodOrders.forEach(o => {
        const cur = spendMap.get(o.reseller_id) || { total: 0, count: 0 };
        spendMap.set(o.reseller_id, {
          total: cur.total + (o.price_cents || 0),
          count: cur.count + 1
        });
      });

      const topIds = Array.from(spendMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(e => e[0]);

      if (topIds.length > 0) {
        const { data: rs } = await supabase.from("resellers").select("id,display_name").in("id", topIds);
        const rMap = new Map((rs ?? []).map((r: any) => [r.id, r.display_name]));
        
        setTopResellers(
          topIds.map(id => ({
            id,
            display_name: rMap.get(id) ?? "—",
            total_cents: spendMap.get(id)!.total,
            orders_count: spendMap.get(id)!.count,
          }))
        );
      } else {
        setTopResellers([]);
      }
    } else {
      setTopResellers([]);
    }

    if (usageLogsData && usageLogsData.length > 0) {
      const resIds = [...new Set(usageLogsData.map((l: any) => l.reseller_id).filter(Boolean))];
      const { data: resNames } = await supabase.from("resellers").select("id, display_name").in("id", resIds as string[]);
      const nameMap = new Map(resNames?.map(r => [r.id, r.display_name]) || []);
      
      setApiLogs(usageLogsData.map((l: any) => ({
        ...l,
        reseller_name: nameMap.get(l.reseller_id) || "—"
      })));
    }

    setLoading(false);
    } catch (e) {
      console.error("[GerenteDashboard] fetchStats failed", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period, orderPage, apiLogPage]);

  const applyCustomRange = () => {
    if (customRange.from) {
      fetchStats();
    }
  };


  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/10" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">carregando ecossistema</p>
      </div>
    );
  }

  const periodLabels: Record<string, string> = {
    all: "Histórico completo",
    today: "Hoje",
    week: "Últimos 7 dias",
    month: "Mês atual",
    last_month: "Mês anterior",
    custom: "Período personalizado",
  };

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-700 max-w-7xl mx-auto px-1 sm:px-0">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0%, transparent 50%), radial-gradient(circle at 80% 80%, hsl(var(--primary)) 0%, transparent 50%)",
          }}
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                live · {periodLabels[period] ?? period}
              </span>
            </div>

            <h1 className="font-display text-4xl font-black tracking-tighter sm:text-6xl lg:text-7xl leading-[0.9]">
              Dashboard
              <br />
              <span className="text-primary italic">Geral.</span>
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">
              Monitoramento em tempo real do ecossistema. Métricas, vendas e
              rede de revendedores em uma única interface.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {period === "custom" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 gap-2 border-border bg-background/60 font-mono text-xs uppercase tracking-wider">
                      <Calendar className="h-4 w-4" />
                      {customRange.from ? (
                        customRange.to ? (
                          <>{format(customRange.from, "dd/MM", { locale: ptBR })} - {format(customRange.to, "dd/MM", { locale: ptBR })}</>
                        ) : (
                          format(customRange.from, "dd/MM", { locale: ptBR })
                        )
                      ) : (
                        "Selecionar"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-border bg-card" align="start">
                    <CalendarComponent
                      initialFocus mode="range" defaultMonth={customRange.from}
                      selected={{ from: customRange.from, to: customRange.to }}
                      onSelect={(range) => setCustomRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={1}
                    />
                    <div className="p-3 border-t border-border">
                      <Button className="w-full h-8 text-[10px] font-bold uppercase tracking-widest" onClick={applyCustomRange} disabled={!customRange.from}>
                        Aplicar Filtro
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-background/60 p-1 backdrop-blur">
                {[
                  { id: "all", label: "Tudo" },
                  { id: "today", label: "Hoje" },
                  { id: "week", label: "7d" },
                  { id: "month", label: "Mês" },
                  { id: "custom", label: "Custom" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPeriod(item.id)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${
                      period === item.id
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hero KPI strip */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-background/70 p-5 backdrop-blur">
              <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Recargas hoje
              </div>
              <div className="mt-2 font-display font-black tracking-tighter text-emerald-600 text-xl">
                {formatBRL(todayRecharge.cents)}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {todayRecharge.count} recargas{todayRecharge.count === 1 ? "" : "s"} no MisticPay
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-5 backdrop-blur">
              <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                <Wallet className="h-3 w-3 text-primary" /> Saldo Provedor
              </div>
              <div className="mt-2 font-display font-black tracking-tighter text-xl">
                {providerBalance}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                crédito disponível para recargas
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Métricas Principais */}
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
            ▸ Métricas principais
          </h2>
          <span className="text-[10px] font-mono text-muted-foreground/60">{periodLabels[period] ?? period}</span>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total faturado"
            value={formatBRL(stats.revenueCents)}
            hint={`${stats.ordersCompleted} pedidos liquidados`}
            icon={TrendingUp}
            accent="emerald"
          />
          <StatCard
            label="Saldo Gateway"
            value={gatewayBalance}
            hint="Disponível para saque"
            icon={Wallet}
            accent="primary"
          />
          <StatCard
            label="Volume Recargas"
            value={formatBRL(stats.rechargeTotalCents)}
            hint={`${stats.rechargePaidCount} transações aprovadas`}
            icon={Wallet}
            accent="violet"
          />
          <StatCard
            label="Vendas totais"
            value={stats.ordersTotal}
            hint={`${stats.ordersPending} pendentes no período`}
            icon={ShoppingCart}
            accent="sky"
          />
        </div>
      </div>


      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
            ▸ Atividade em tempo real
          </h2>
        </div>

        <div className="grid gap-6 grid-cols-1">
          {/* Pedidos recentes */}
          <section className="group relative rounded-2xl sm:rounded-3xl border border-border bg-card p-4 sm:p-6 overflow-hidden transition-all hover:shadow-md">
            <div className="absolute -right-8 -bottom-8 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
              <ShoppingCart className="h-40 w-40 rotate-12 text-primary" />
            </div>
            <div className="relative z-10 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base sm:text-lg font-bold tracking-tight">Movimentações de Crédito</h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">entradas e saídas do sistema</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const nextState = !isRecentOrdersExpanded;
                  setIsRecentOrdersExpanded(nextState);
                  if (nextState) setIsApiLogsExpanded(false);
                }}
                className="h-8 gap-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-muted lg:hidden"
              >
                {isRecentOrdersExpanded ? (<>Recolher <ChevronUp className="h-3 w-3" /></>) : (<>Expandir <ChevronDown className="h-3 w-3" /></>)}
              </Button>
            </div>

            <div className={`${isRecentOrdersExpanded ? 'block' : 'hidden lg:block'}`}>
              {creditMovements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Wallet className="mb-2 h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium italic">Nenhuma movimentação detectada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const pageItems = creditMovements.slice((orderPage - 1) * ITEMS_PER_PAGE, orderPage * ITEMS_PER_PAGE);
                    const today = new Date(); today.setHours(0,0,0,0);
                    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                    const groupLabel = (iso: string) => {
                      const d = new Date(iso); const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                      if (dd.getTime() === today.getTime()) return "Hoje";
                      if (dd.getTime() === yesterday.getTime()) return "Ontem";
                      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
                    };
                    const groups: { label: string; items: typeof pageItems }[] = [];
                    pageItems.forEach((m) => {
                      const lbl = groupLabel(m.created_at);
                      const last = groups[groups.length - 1];
                      if (last && last.label === lbl) last.items.push(m);
                      else groups.push({ label: lbl, items: [m] });
                    });
                    const kindLabels: Record<string, string> = {
                      deposit: "Depósito", recharge: "Recargas", bonus: "Bônus", refund: "Estorno",
                      adjustment: "Ajuste", license_purchase: "Compra licença", credit_purchase: "Compra recargas",
                      order: "Pedido", debit: "Débito", order_debit: "Pedido",
                      manual_credit: "Crédito manual", credit_purchase_refund: "Estorno compra",
                      credit_recharge_api: "Recargas API",
                    };
                    return groups.map((g) => (
                      <div key={g.label} className="space-y-2">
                        <div className="flex items-center gap-3 px-1">
                          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground/70">{g.label}</span>
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] font-mono text-muted-foreground/50">{g.items.length}</span>
                        </div>
                        {g.items.map((m) => {
                          const isIn = m.amount_cents >= 0;
                          const kindLabel = kindLabels[m.kind] ?? m.kind;
                          const desc = m.description ?? "";
                          const isStoreSale = m.kind === "order_debit" && /venda\s*loja/i.test(desc);
                          const isApiOrder = m.kind === "order_debit" && !isStoreSale;
                          const isCreditPurchase = m.kind === "credit_purchase";
                          const isManualCredit = m.kind === "manual_credit";
                          const isRecharge = m.kind === "recharge";
                          const isSaleLike = isStoreSale || isCreditPurchase || isApiOrder;
                          // Tom: entrada=verde, venda/compra=azul (destaque), outras saídas=vermelho
                          const tone = isIn
                            ? { bg: "bg-emerald-500/10", text: "text-emerald-600", border: "border-emerald-500/20", ring: "" }
                            : isApiOrder
                              ? { bg: "bg-fuchsia-500/15", text: "text-fuchsia-600", border: "border-fuchsia-500/40", ring: "ring-1 ring-fuchsia-500/30 shadow-[0_0_0_3px_hsl(var(--background))]" }
                              : isSaleLike
                                ? { bg: "bg-sky-500/15", text: "text-sky-600", border: "border-sky-500/40", ring: "ring-1 ring-sky-500/30 shadow-[0_0_0_3px_hsl(var(--background))]" }
                                : { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20", ring: "" };
                          const Arrow = isIn ? ArrowDownLeft : ArrowUpRight;
                          return (
                             <div key={m.id} className={`group/item flex items-center justify-between rounded-xl sm:rounded-2xl border ${tone.border} bg-background/40 p-2 sm:p-3 hover:bg-background transition-all ${isApiOrder ? "bg-fuchsia-500/[0.04]" : isSaleLike ? "bg-sky-500/[0.04]" : ""}`}>
                               <div className="flex items-center gap-3 text-left min-w-0">
                                 <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${tone.bg} ${tone.text} ${tone.border}`}>
                                   <Arrow className="h-4 w-4" strokeWidth={2.5} />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold flex items-center gap-1.5 truncate">
                                      {m.reseller_name}
                                      {isSaleLike ? (
                                        <>
                                          <span className={`inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 font-mono border ${isApiOrder ? "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30" : "bg-sky-500/15 text-sky-600 border-sky-500/30"}`}>
                                            <StoreIcon className="h-2.5 w-2.5" /> {isCreditPurchase ? "Recargas" : "Extensão"}
                                          </span>
                                          <span className={`inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 font-mono border ${isStoreSale ? "bg-violet-500/15 text-violet-600 border-violet-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}`}>
                                            {isStoreSale ? <><StoreIcon className="h-2.5 w-2.5" /> Venda na Loja</> : <><Hand className="h-2.5 w-2.5" /> Manual</>}
                                          </span>
                                        </>
                                      ) : (
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 font-mono border ${tone.bg} ${tone.text} ${tone.border}`}>{kindLabel}</span>
                                      )}
                                      {isManualCredit && (
                                        <span className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 font-mono bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                          <Hand className="h-2.5 w-2.5" /> Manual
                                        </span>
                                      )}
                                      {isRecharge && (
                                        <span className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded-md uppercase tracking-tighter shrink-0 font-mono bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                                          <Hand className="h-2.5 w-2.5" /> MisticPay
                                        </span>
                                      )}
                                    </div>
                                  <div className="text-[9px] text-muted-foreground font-mono truncate">{desc || '—'}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className={`text-xs font-mono font-bold ${tone.text}`}>
                                  {isIn ? '+' : '−'}{formatBRL(Math.abs(m.amount_cents))}
                                </div>
                                <div className="text-[9px] text-muted-foreground">{fmtDate(m.created_at)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}

              <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4">
                {Array.from({ length: Math.min(5, Math.ceil(creditMovements.length / ITEMS_PER_PAGE)) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setOrderPage(i + 1)}
                    className={`h-7 w-7 rounded-lg text-[10px] font-bold transition-all ${
                      orderPage === i + 1 ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            {!isRecentOrdersExpanded && (
              <div className="text-center py-4 lg:hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 italic">Toque em expandir para ver os pedidos</p>
              </div>
            )}
          </section>

          {/* Requisições de APIs */}
          <section className="group relative rounded-2xl sm:rounded-3xl border border-border bg-card p-4 sm:p-6 overflow-hidden transition-all hover:shadow-md">
            <div className="absolute -right-8 -bottom-8 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
              <Database className="h-40 w-40 rotate-12 text-primary" />
            </div>
            <div className="relative z-10 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base sm:text-lg font-bold tracking-tight">Requisições de APIs</h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">tráfego do gateway</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsApiLogsExpanded((v) => !v)}
                className="h-8 gap-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-muted"
              >
                {isApiLogsExpanded ? (<>Recolher <ChevronUp className="h-3 w-3" /></>) : (<>Expandir <ChevronDown className="h-3 w-3" /></>)}
              </Button>
            </div>

            <div className={`${isApiLogsExpanded ? 'block' : 'hidden'}`}>
              {apiLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Database className="mb-2 h-10 w-10 opacity-20" />
                  <p className="text-sm font-medium italic">Sem logs recentes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3 hover:bg-background transition-all">
                      <div className="flex items-center gap-3 text-left min-w-0">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${log.status_code >= 400 ? 'bg-destructive animate-pulse' : 'bg-emerald-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold uppercase tracking-tight flex items-center gap-2 truncate">
                            {log.reseller_name}
                            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="text-primary">LovMain</span>
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground italic truncate flex items-center gap-2">
                            POST /{log.endpoint}
                            <span>•</span>
                            {fmtDate(log.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono text-[10px] font-bold shrink-0 ml-2">
                        <span className={`px-2 py-1 rounded-md ${log.status_code >= 400 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
                          {log.status_code}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4">
                {Array.from({ length: Math.min(5, Math.ceil(stats.totalApiLogs / ITEMS_PER_PAGE)) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setApiLogsPage(i + 1)}
                    className={`h-7 w-7 rounded-lg text-[10px] font-bold transition-all ${
                      apiLogPage === i + 1 ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            {!isApiLogsExpanded && (
              <div className="text-center py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 italic">Clique em expandir para ver os logs</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
