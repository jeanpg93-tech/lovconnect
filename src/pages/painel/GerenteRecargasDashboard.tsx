import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import {
  Loader2, RefreshCw, Activity, CheckCircle2, Clock, XCircle,
  Coins, TrendingUp, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
  Wallet, ArrowUpRight, ArrowDownRight, Filter, Calendar,
  ArrowRight, Download, CreditCard
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { RechargeSettingsCard } from "@/components/painel/RechargeSettingsCard";
import { Badge } from "@/components/ui/badge";

type Pedido = {
  id: string;
  status: string;
  created_at: string;
  raw: any;
};

export default function GerenteRecargaDashboard() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<"hoje" | "7d" | "14d" | "30d">("hoje");

  const call = async (action: string) => {
    try {
      const { data, error } = await invokeAuthenticatedFunction(`lovable-credits-api?action=${action}`, { method: "GET" });
      if (error || data?.error) {
        console.error(`Error calling ${action}:`, error || data?.error);
        return null;
      }
      return data;
    } catch (e) { 
      console.error(`Exception calling ${action}:`, e);
      return null; 
    }
  };

  const load = async () => {
    setRefreshing(true);
    try {
      const [balanceData, ordersData] = await Promise.all([
        call("balance"),
        call("orders")
      ]);

      const s = balanceData?.data?.saldoReais ?? balanceData?.saldoReais ?? 
                (balanceData?.data?.saldoCentavos != null ? balanceData.data.saldoCentavos / 100 : 
                (balanceData?.data?.saldo ?? balanceData?.saldo ?? null));
      setSaldo(s != null ? Number(s) : null);

      const list = (ordersData?.data?.pedidos ?? ordersData?.pedidos ?? []).map((p: any) => ({
        id: p.id ?? p.pedidoId ?? "",
        status: String(p.status ?? "—"),
        created_at: p.criadoEm ?? p.dataCriacao ?? new Date().toISOString(),
        raw: p,
      })) as Pedido[];
      setPedidos(list);
      
      if (!loading) toast.success("Dados atualizados com sucesso");
    } catch (err) {
      toast.error("Erro ao carregar dados da dashboard");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const data = useMemo(() => {
    const sucessoSet = new Set(["sucesso", "finalizado", "avaliado"]);
    const pendingSet = new Set(["aguardando", "configurando", "recarregando", "entregando"]);
    const failSet = new Set(["falha", "queimado", "cancelado", "reembolsado"]);

    const daysCount = timeRange === "hoje" ? 1 : timeRange === "7d" ? 7 : timeRange === "14d" ? 14 : 30;
    const days: { date: string; label: string; total: number; sucesso: number; falha: number; creditos: number; valor: number }[] = [];
    const now = new Date();
    
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = subDays(now, i);
      const key = format(d, "yyyy-MM-dd");
      days.push({
        date: key,
        label: format(d, "dd/MM", { locale: ptBR }),
        total: 0, sucesso: 0, falha: 0, creditos: 0, valor: 0,
      });
    }
    const dayMap = new Map(days.map((d) => [d.date, d]));

    const statusCount = new Map<string, number>();
    let totalCreditos = 0, totalValor = 0;
    let totalSucesso = 0, totalFalha = 0, totalPend = 0;

    const startDate = subDays(now, daysCount);

    for (const u of pedidos) {
      const orderDate = new Date(u.created_at);
      if (orderDate < startDate) continue;

      const s = (u.status || "").toLowerCase();
      statusCount.set(s, (statusCount.get(s) || 0) + 1);

      const raw = u.raw || {};
      const creditos = Number(raw.creditos ?? 0) || 0;
      const valor = Number(raw.precoCentavos ?? raw.valorCentavos ?? 0) / 100 || Number(raw.precoReais ?? raw.valorReais ?? 0) || 0;
      
      if (sucessoSet.has(s)) {
        totalSucesso++;
        totalCreditos += creditos;
        totalValor += valor;
      } else if (failSet.has(s)) {
        totalFalha++;
      } else if (pendingSet.has(s)) {
        totalPend++;
      }

      const dayKey = format(orderDate, "yyyy-MM-dd");
      const day = dayMap.get(dayKey);
      if (day) {
        day.total += 1;
        if (sucessoSet.has(s)) {
          day.sucesso += 1;
          day.creditos += creditos;
          day.valor += valor;
        }
        if (failSet.has(s)) day.falha += 1;
      }
    }

    const STATUS_COLORS: Record<string, string> = {
      sucesso: "#10b981", finalizado: "#10b981", avaliado: "#3b82f6",
      aguardando: "#f59e0b", configurando: "#a855f7", recarregando: "#8b5cf6",
      entregando: "#06b6d4", falha: "#ef4444", queimado: "#f97316",
      cancelado: "#f43f5e", reembolsado: "#0ea5e9",
    };
    
    const pieData = Array.from(statusCount.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), 
      value, 
      color: STATUS_COLORS[name] || "#71717a",
    })).sort((a, b) => b.value - a.value);

    const filteredPedidosCount = Array.from(statusCount.values()).reduce((a, b) => a + b, 0);
    const successRate = filteredPedidosCount ? (totalSucesso / filteredPedidosCount) * 100 : 0;
    const ticketMedio = totalSucesso > 0 ? totalValor / totalSucesso : 0;

    return { 
      days, 
      pieData, 
      totalCreditos, 
      totalValor, 
      totalSucesso, 
      totalFalha, 
      totalPend, 
      successRate, 
      ticketMedio, 
      totalPedidos: filteredPedidosCount 
    };
  }, [pedidos, timeRange]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    {
      label: "Saldo Disponível",
      value: saldo != null ? `R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—",
      hint: "Crédito atual no provedor",
      icon: Wallet,
      gradient: "from-primary/20 via-primary/5 to-transparent",
      ring: "ring-primary/20",
      iconBg: "bg-primary/15 text-primary",
    },
    {
      label: "Faturamento Bruto",
      value: `R$ ${data.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      hint: `Ticket médio R$ ${data.ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      ring: "ring-emerald-500/20",
      iconBg: "bg-emerald-500/15 text-emerald-500",
    },
    {
      label: "Total de Pedidos",
      value: data.totalPedidos.toLocaleString("pt-BR"),
      hint: `${data.totalSucesso} sucesso · ${data.totalPend} em curso · ${data.totalFalha} falha`,
      icon: Activity,
      gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
      ring: "ring-blue-500/20",
      iconBg: "bg-blue-500/15 text-blue-500",
    },
    {
      label: "Taxa de Sucesso",
      value: `${data.successRate.toFixed(1)}%`,
      hint: "Eficácia das recarga",
      icon: CheckCircle2,
      gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
      ring: "ring-violet-500/20",
      iconBg: "bg-violet-500/15 text-violet-500",
    },
  ];

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
              <BarChart3 className="h-3 w-3" /> Painel do provedor
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Dashboard de Recarga</h1>
            <p className="text-sm text-muted-foreground">Monitore desempenho, volume e saúde dos pedidos em tempo real.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-background/60 p-0.5 backdrop-blur">
              {(["hoje", "7d", "14d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    timeRange === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "hoje" ? "Hoje" : r === "7d" ? "7 dias" : r === "14d" ? "14 dias" : "30 dias"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="bg-background/60 backdrop-blur">
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} /> Atualizar
            </Button>
          </div>
        </div>
      </div>

      <RechargeSettingsCard />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={cn(
              "group relative overflow-hidden bg-gradient-to-br transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-1",
              k.gradient,
              k.ring,
            )}
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-foreground/[0.02] blur-2xl transition-all group-hover:bg-foreground/5" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.label}</CardTitle>
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-110", k.iconBg)}>
                <k.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold tracking-tight">{k.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" /> Evolução do Volume
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Sucessos vs falhas por dia</p>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-background">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ao vivo
            </Badge>
          </CardHeader>
          <CardContent className="h-[320px] pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.days}>
                <defs>
                  <linearGradient id="colSucc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.2)",
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="sucesso" stroke="#10b981" fill="url(#colSucc)" strokeWidth={2.5} name="Sucesso" />
                <Area type="monotone" dataKey="falha" stroke="#ef4444" fill="url(#colFail)" strokeWidth={2} name="Falha" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-violet-500" /> Distribuição por status
            </CardTitle>
            <p className="text-xs text-muted-foreground">Pedidos no período</p>
          </CardHeader>
          <CardContent className="h-[320px] pt-6">
            {data.pieData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {data.pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Faturamento por dia */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-500" /> Faturamento diário
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Receita gerada por dia no período</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-bold">R$ {data.totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
          </div>
        </CardHeader>
        <CardContent className="h-[260px] pt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.days}>
              <defs>
                <linearGradient id="colBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={1} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} tickFormatter={(v) => `R$ ${v}`} />
              <Tooltip
                cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
                formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Faturamento"]}
              />
              <Bar dataKey="valor" fill="url(#colBar)" radius={[6, 6, 0, 0]} name="Faturamento" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
