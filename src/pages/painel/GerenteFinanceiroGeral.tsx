import { useEffect, useState } from "react";
import { PageContainer } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Receipt, PencilLine, CalendarIcon, X, Repeat } from "lucide-react";
import FinanceiroVisaoGeral from "@/components/painel/financeiro/FinanceiroVisaoGeral";
import FinanceiroTransacoes from "@/components/painel/financeiro/FinanceiroTransacoes";
import FinanceiroLancamentosManuais from "@/components/painel/financeiro/FinanceiroLancamentosManuais";
import FinanceiroMensalidades from "@/components/painel/financeiro/FinanceiroMensalidades";
import type { DateRange, CustomRange } from "@/hooks/useFinancialOverview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DateRange as RDPRange } from "react-day-picker";

export default function GerenteFinanceiroGeral() {
  const [dateFilter, setDateFilter] = useState<DateRange>("month");
  const [customRange, setCustomRange] = useState<CustomRange | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [earliestDate, setEarliestDate] = useState<Date | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const queries = await Promise.all([
        supabase.from("recharge_intents").select("paid_at").eq("status", "paid").order("paid_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("activation_payments").select("paid_at").in("status", ["paid", "approved"]).order("paid_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("reseller_subscription_charges").select("paid_at").eq("status", "paid").order("paid_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("reseller_pack_purchases").select("paid_at").eq("status", "paid").order("paid_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("storefront_orders").select("paid_at").in("status", ["paid", "completed", "delivered", "manual_concluido", "manual_aceito"]).order("paid_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("reseller_credit_purchases").select("created_at").in("status", ["sucesso", "manual_aceito", "manual_concluido"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("manual_financial_entries").select("entry_date").order("entry_date", { ascending: true }).limit(1).maybeSingle(),
      ]);
      const dates = queries
        .map((q: any) => q?.data?.paid_at ?? q?.data?.created_at ?? q?.data?.entry_date)
        .filter(Boolean)
        .map((s: string) => new Date(s));
      if (!cancel && dates.length) {
        const min = dates.reduce((a, b) => (a < b ? a : b));
        setEarliestDate(min);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const customLabel = customRange
    ? customRange.to && customRange.to.getTime() !== customRange.from.getTime()
      ? `${format(customRange.from, "dd/MM", { locale: ptBR })} - ${format(customRange.to, "dd/MM", { locale: ptBR })}`
      : format(customRange.from, "dd/MM/yy", { locale: ptBR })
    : "Personalizado";

  const periodLabel = (() => {
    const now = new Date();
    const fmt = (d: Date) => format(d, "dd/MM/yyyy", { locale: ptBR });
    if (dateFilter === "today") {
      const s = new Date(now); s.setHours(0, 0, 0, 0);
      return `${fmt(s)} — ${fmt(now)} (hoje)`;
    }
    if (dateFilter === "week") {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      return `${fmt(s)} — ${fmt(now)} (últimos 7 dias)`;
    }
    if (dateFilter === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return `${fmt(s)} — ${fmt(now)} (mês atual)`;
    }
    if (dateFilter === "custom" && customRange?.from) {
      const e = customRange.to ?? customRange.from;
      return `${fmt(customRange.from)} — ${fmt(e)}`;
    }
    const startLabel = earliestDate ? fmt(earliestDate) : "início";
    return `${startLabel} — ${fmt(now)} (todo o período)`;
  })();

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
        <div className="flex flex-col gap-2 items-center sm:items-start w-full">
          <h1 className="font-display text-3xl font-black tracking-tighter sm:text-5xl">
            Painel <span className="text-primary italic">Financeiro</span>
          </h1>
          <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed px-2 sm:px-0">
            Receita, custos, lucro e movimentações do ecossistema em tempo real.
          </p>
        </div>
        <div className="flex w-full sm:w-auto flex-col items-stretch justify-center sm:flex-row sm:items-center sm:justify-end gap-2">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
            {[
              { id: "all", label: "Tudo" },
              { id: "today", label: "Hoje" },
              { id: "week", label: "7 Dias" },
              { id: "month", label: "Mês" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => { setDateFilter(d.id as DateRange); setCustomRange(undefined); }}
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
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-auto gap-2 rounded-xl border-white/10 bg-white/5 px-3 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest",
                  dateFilter === "custom" && "border-primary/60 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {customLabel}
                {dateFilter === "custom" && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateFilter("month");
                      setCustomRange(undefined);
                    }}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                locale={ptBR}
                selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(r: RDPRange | undefined) => {
                  if (r?.from) {
                    setCustomRange({ from: r.from, to: r.to ?? r.from });
                    setDateFilter("custom");
                    if (r.to) setPickerOpen(false);
                  } else {
                    setCustomRange(undefined);
                  }
                }}
                numberOfMonths={1}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] font-bold uppercase tracking-widest"
                  onClick={() => {
                    setCustomRange(undefined);
                    setDateFilter("month");
                    setPickerOpen(false);
                  }}
                >
                  Limpar
                </Button>
                <Button
                  size="sm"
                  className="text-[10px] font-bold uppercase tracking-widest"
                  disabled={!customRange}
                  onClick={() => setPickerOpen(false)}
                >
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex items-center justify-center sm:justify-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarIcon className="h-3.5 w-3.5 text-primary" />
        <span>Período: <span className="text-foreground">{periodLabel}</span></span>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-4 w-4" /> Transações
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <Repeat className="h-4 w-4" /> Mensalidades
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <PencilLine className="h-4 w-4" /> Lançamentos Manuais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <FinanceiroVisaoGeral range={dateFilter} customRange={customRange} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-0">
          <FinanceiroTransacoes dateFilter={dateFilter} customRange={customRange} />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-0">
          <FinanceiroMensalidades range={dateFilter} customRange={customRange} />
        </TabsContent>
        <TabsContent value="manual" className="mt-0">
          <FinanceiroLancamentosManuais />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
