import { useState } from "react";
import { PageContainer } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Receipt, PencilLine } from "lucide-react";
import FinanceiroVisaoGeral from "@/components/painel/financeiro/FinanceiroVisaoGeral";
import FinanceiroTransacoes from "@/components/painel/financeiro/FinanceiroTransacoes";
import FinanceiroLancamentosManuais from "@/components/painel/financeiro/FinanceiroLancamentosManuais";
import type { DateRange } from "@/hooks/useFinancialOverview";

export default function GerenteFinanceiroGeral() {
  const [dateFilter, setDateFilter] = useState<DateRange>("month");
  const [tab, setTab] = useState("overview");

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
                onClick={() => setDateFilter(d.id as DateRange)}
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

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2">
            <Receipt className="h-4 w-4" /> Transações
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <PencilLine className="h-4 w-4" /> Lançamentos Manuais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <FinanceiroVisaoGeral range={dateFilter} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-0">
          <FinanceiroTransacoes dateFilter={dateFilter} />
        </TabsContent>
        <TabsContent value="manual" className="mt-0">
          <FinanceiroLancamentosManuais />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
