import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { DateRange } from "@/hooks/useFinancialOverview";

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

export default function FinanceiroTransacoes({ dateFilter }: { dateFilter: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MisticTransaction[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("COMPLETO");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: response, error } = await supabase.functions.invoke(
          `misticpay-list-transactions?page=${page}&status=${statusFilter === "all" ? "" : statusFilter}`
        );
        if (error) throw error;
        let txs = response?.data || [];
        txs = txs.filter((it: MisticTransaction) => !(it.transactionType === "RETIRADA" && it.transactionMethod === "PIX"));
        if (dateFilter !== "all") {
          const now = new Date();
          txs = txs.filter((item: MisticTransaction) => {
            const d = new Date(item.createdAt);
            if (dateFilter === "today") return d.toDateString() === now.toDateString();
            if (dateFilter === "week") {
              const w = new Date(); w.setDate(now.getDate() - 7); return d >= w;
            }
            if (dateFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            return true;
          });
        }
        setData(txs);
        setTotalItems(response?.pagination?.total || 0);
        setTotalPages(response?.pagination?.totalPages || 1);
      } catch (err) {
        toast({ title: "Erro ao carregar transações", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, statusFilter, dateFilter, toast]);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-6">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-8 w-1 bg-primary rounded-full" />
          <h3 className="font-display text-lg font-bold tracking-tight">Histórico MisticPay</h3>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {["all", "COMPLETO", "PENDENTE", "FALHA", "CANCELADO"].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className="h-8 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap flex-shrink-0"
            >
              {s === "all" ? "Todos" : s === "COMPLETO" ? "Completos" : s === "PENDENTE" ? "Pendentes" : s === "FALHA" ? "Falhas" : "Cancelados"}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
              <div className="h-4 w-24 bg-white/5 rounded" />
              <div className="h-6 w-full bg-white/5 rounded" />
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
                <div key={item.id} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/30 transition-all min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-border flex-wrap">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                      <span className="font-bold text-foreground/80">{format(new Date(item.createdAt), "dd/MM/yy", { locale: ptBR })}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <span>{format(new Date(item.createdAt), "HH:mm:ss", { locale: ptBR })}</span>
                    </div>
                    <span className={cn("inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", status.color)}>
                      <status.icon className="h-3 w-3 mr-1" />
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm truncate">{item.clientName || "Cliente não identificado"}</h4>
                      <span className="text-[10px] text-muted-foreground font-mono truncate block">{item.clientDocument || "—"}</span>
                    </div>
                    <div className="text-right shrink-0 max-w-[45%]">
                      <div className="font-mono font-black text-base text-primary tabular-nums">
                        {item.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                      {item.fee > 0 && (
                        <div className="text-[10px] text-destructive/80 font-bold">
                          -{item.fee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-3 border-t border-border flex-wrap">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Tipo</span>
                      <span className="text-[10px] font-bold">{item.transactionType}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Método</span>
                      <span className="text-[10px] font-bold">{item.transactionMethod}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 sm:flex-row">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">Total de {totalItems} registros</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading} className="h-8 px-3">Ant.</Button>
          <span className="text-xs font-mono">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="h-8 px-3">Próx.</Button>
        </div>
      </div>
    </div>
  );
}