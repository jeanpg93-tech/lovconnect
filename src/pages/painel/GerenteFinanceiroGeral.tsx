import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, PageContainer } from "@/components/painel/PageHeader";
import { 
  Wallet, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  User, 
  ArrowRight,
  Filter,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Banknote,
  TrendingUp
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type MisticTransaction = {
  id: number;
  value: number;
  fee: number;
  clientName: string;
  clientDocument: string;
  description: string;
  transactionState: "PENDENTE" | "COMPLETO" | "FALHA" | "CANCELADO";
  transactionType: string;
  transactionMethod: string;
  createdAt: string;
  updatedAt: string;
};

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  COMPLETO: { label: "Completo", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  PENDENTE: { label: "Pendente", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Clock },
  FALHA: { label: "Falha", color: "bg-destructive/15 text-destructive", icon: XCircle },
  CANCELADO: { label: "Cancelado", color: "bg-muted text-muted-foreground", icon: XCircle },
};

export default function GerenteFinanceiroGeral() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MisticTransaction[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [rechargesTotal, setRechargesTotal] = useState(0);
  const [rechargesCount, setRechargesCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("COMPLETO");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch MisticPay transactions from API for current page view
      const { data: response, error: misticError } = await supabase.functions.invoke(
        `misticpay-list-transactions?page=${page}&status=${statusFilter === "all" ? "" : statusFilter}`
      );

      if (misticError) throw misticError;

      let transactions = response?.data || [];
      
      // Filter out PIX withdrawals (RETIRADA PIX)
      transactions = transactions.filter((item: MisticTransaction) => 
        !(item.transactionType === "RETIRADA" && item.transactionMethod === "PIX")
      );

      // Filter locally by date for the current page table
      if (dateFilter !== "all") {
        const now = new Date();
        transactions = transactions.filter((item: MisticTransaction) => {
          const itemDate = new Date(item.createdAt);
          if (dateFilter === "today") {
            return itemDate.toDateString() === now.toDateString();
          }
          if (dateFilter === "week") {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return itemDate >= weekAgo;
          }
          if (dateFilter === "month") {
            return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
          }
          return true;
        });
      }

      setData(transactions);
      setTotalItems(response?.pagination?.total || 0);
      setTotalPages(response?.pagination?.totalPages || 1);

      // 2. Dashboard logic: Fetch from recharge_intents table exactly like GerenteDashboard.tsx (lines 108 & 118)
      let query = supabase
        .from("recharge_intents")
        .select("amount_cents, paid_at")
        .eq("status", "paid");

      if (dateFilter !== "all") {
        const now = new Date();
        if (dateFilter === "today") {
          const startOfToday = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          query = query.gte("paid_at", startOfToday);
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.setDate(now.getDate() - 7)).toISOString();
          query = query.gte("paid_at", weekAgo);
        } else if (dateFilter === "month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          query = query.gte("paid_at", startOfMonth);
        }
      }

      const { data: recharges, error: rechargeError } = await query;

      if (rechargeError) throw rechargeError;

      // Logic from GerenteDashboard.tsx: sum amount_cents and get length
      const totalCents = (recharges || []).reduce((s: number, r: any) => s + Number(r.amount_cents ?? 0), 0);
      setRechargesTotal(totalCents);
      setRechargesCount(recharges?.length || 0);

    } catch (err) {
      console.error("Erro ao carregar financeiro:", err);
      toast({
        title: "Erro ao carregar dados",
        description: "Verifique se você tem permissão de gerente ou se as credenciais da API estão configuradas.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, statusFilter, dateFilter]);


  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
        <div className="flex flex-col gap-2 items-center sm:items-start w-full">
          <h1 className="font-display text-3xl font-black tracking-tighter sm:text-5xl">
            Painel <span className="text-primary italic">Financeiro</span>
          </h1>
          <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed px-2 sm:px-0">
            Acompanhe depósitos, recarga e toda a saúde financeira do ecossistema em tempo real.
          </p>
        </div>

        <div className="flex w-full sm:w-auto items-center justify-center sm:justify-end gap-2">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
            {[
              { id: "all", label: "Tudo" },
              { id: "today", label: "Hoje" },
              { id: "week", label: "7 Dias" },
              { id: "month", label: "Mês" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => { setDateFilter(d.id); setPage(1); }}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest rounded-lg transition-all whitespace-nowrap ${
                  dateFilter === d.id 
                    ? "bg-primary text-primary-foreground shadow-glow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Média de Depósito"
          value={rechargesCount > 0 
            ? ((rechargesTotal / rechargesCount) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) 
            : "R$ 0,00"}
          icon={TrendingUp}
          hint={`Base: ${rechargesCount} recarga`}
          className="p-3.5 sm:p-6"
        />
        <StatCard
          label="Qtde. Recarga"
          value={rechargesCount}
          icon={Calendar}
          hint="Volume total"
          className="p-3.5 sm:p-6"
        />
        <StatCard
          label="Total Recarregado"
          value={(rechargesTotal / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          icon={Banknote}
          hint="Soma bruta processada"
          className="p-4 sm:p-6 col-span-2 lg:col-span-1"
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="h-8 w-1 bg-primary rounded-full" />
              <h3 className="font-display text-lg font-bold tracking-tight">Histórico de Transações</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none justify-start w-full">
            {["all", "COMPLETO", "PENDENTE", "FALHA", "CANCELADO"].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className="capitalize h-8 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap flex-shrink-0"
              >
                {s === "all" ? "Todos" : 
                  s === "COMPLETO" ? "Completos" : 
                  s === "PENDENTE" ? "Pendentes" :
                  s === "FALHA" ? "Falhas" : "Cancelados"}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-white/5 rounded" />
                  <div className="h-4 w-16 bg-white/5 rounded" />
                </div>
                <div className="h-6 w-full bg-white/5 rounded" />
                <div className="h-4 w-32 bg-white/5 rounded" />
              </div>
            ))
          ) : data.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-black/20 p-10 text-center text-muted-foreground italic">
              Nenhuma movimentação encontrada.
            </div>
          ) : (
            <div className="grid gap-3">
              {data.map((item) => {
                const status = statusMap[item.transactionState] || { label: item.transactionState, color: "bg-muted text-muted-foreground", icon: Clock };
                return (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all group min-w-0 overflow-hidden">
                    {/* Header: data + status */}
                    <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border min-w-0 flex-wrap">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground min-w-0">
                        <span className="font-bold text-foreground/80 truncate">
                          {format(new Date(item.createdAt), "dd/MM/yy", { locale: ptBR })}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                        <span>
                          {format(new Date(item.createdAt), "HH:mm:ss", { locale: ptBR })}
                        </span>
                      </div>
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0",
                        status.color
                      )}>
                        <status.icon className="h-3 w-3 mr-1" />
                        {status.label}
                      </span>
                    </div>

                    {/* Body: cliente + valor */}
                    <div className="flex items-start justify-between gap-3 mb-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-foreground truncate">
                          {item.clientName || "Cliente não identificado"}
                        </h4>
                        <span className="text-[10px] text-muted-foreground font-mono truncate block">
                          {item.clientDocument || "—"}
                        </span>
                      </div>
                      <div className="text-right shrink-0 max-w-[45%]">
                        <div className="font-mono font-black text-base text-primary tabular-nums break-words">
                          {item.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                        {item.fee > 0 && (
                          <div className="text-[10px] text-destructive/80 font-bold tabular-nums">
                            -{item.fee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: tipo + método (chips) */}
                    <div className="flex items-center gap-2 pt-3 border-t border-border flex-wrap min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 min-w-0 max-w-full">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Tipo</span>
                        <span className="text-[10px] font-bold text-foreground truncate">{item.transactionType}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 min-w-0 max-w-full">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Método</span>
                        <span className="text-[10px] font-bold text-foreground truncate">{item.transactionMethod}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 sm:flex-row">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
            Total de {totalItems} registros
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-8 px-3 border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest"
            >
              Ant.
            </Button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(3, totalPages) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`h-8 w-8 rounded-lg text-[10px] font-bold transition-all ${
                    page === i + 1 ? 'bg-primary text-white shadow-glow-sm' : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 px-3 border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest"
            >
              Próx.
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}