import { useFinancialOverview, type DateRange } from "@/hooks/useFinancialOverview";
import { StatCard } from "@/components/painel/PageHeader";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Percent,
  ShoppingCart,
  Receipt,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinanceiroVisaoGeral({ range }: { range: DateRange }) {
  const { data, loading } = useFinancialOverview(range);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Receita Total"
          value={brl(data.revenueCents)}
          icon={TrendingUp}
          hint={`Recargas + manuais`}
          className="p-4"
        />
        <StatCard
          label="Custo Total"
          value={brl(data.costCents)}
          icon={TrendingDown}
          hint={`Créditos + taxas + gastos`}
          className="p-4"
        />
        <StatCard
          label="Lucro Líquido"
          value={brl(data.profitCents)}
          icon={Wallet}
          hint={data.profitCents >= 0 ? "Saldo positivo" : "Saldo negativo"}
          className={`p-4 ${
            data.profitCents >= 0 ? "ring-1 ring-emerald-500/30" : "ring-1 ring-red-500/30"
          }`}
        />
        <StatCard
          label="Margem"
          value={`${data.marginPct.toFixed(1)}%`}
          icon={Percent}
          hint="Lucro / Receita"
          className="p-4"
        />
        <StatCard
          label="Recargas"
          value={data.rechargesCount}
          icon={Receipt}
          hint="Depósitos pagos"
          className="p-4"
        />
        <StatCard
          label="Vendas"
          value={data.salesCount}
          icon={ShoppingCart}
          hint="Créditos vendidos"
          className="p-4"
        />
      </div>

      {/* Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-display text-base font-bold mb-4">Composição do Custo</h3>
          <BreakdownBar
            items={[
              { label: "Créditos vendidos (custo provedor)", value: data.costCreditsCents, color: "bg-blue-500" },
              { label: "Taxas gateway (R$ 0,50 / recarga)", value: data.gatewayFeeCents, color: "bg-amber-500" },
              { label: "Gastos manuais", value: data.manualExpenseCents, color: "bg-red-500" },
            ]}
            total={data.costCents}
          />
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-display text-base font-bold mb-4">Composição da Receita</h3>
          <BreakdownBar
            items={[
              { label: "Recargas pagas (revendedores)", value: data.rechargesRevenueCents, color: "bg-emerald-500" },
              { label: "Receitas manuais", value: data.manualRevenueCents, color: "bg-violet-500" },
            ]}
            total={data.revenueCents}
          />
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-display text-base font-bold mb-4">Receita × Custo × Lucro</h3>
        {data.series.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground italic text-sm">Sem dados no período</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${v.toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name="Receita" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cost" name="Custo" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="Lucro" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top resellers */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="font-display text-base font-bold mb-4">Top 5 Revendedores por Lucro</h3>
        {data.topResellers.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground italic text-sm">Sem dados</div>
        ) : (
          <div className="space-y-2">
            {data.topResellers.map((r, i) => (
              <div key={r.reseller_id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary font-black text-xs">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.display_name}</p>
                </div>
                <div className={`font-mono font-black text-sm tabular-nums ${r.profit_cents >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {brl(r.profit_cents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownBar({
  items,
  total,
}: {
  items: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((it, i) => {
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return <div key={i} className={it.color} style={{ width: `${pct}%` }} title={it.label} />;
        })}
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => {
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${it.color}`} />
              <span className="flex-1 truncate">{it.label}</span>
              <span className="font-mono font-bold tabular-nums">{brl(it.value)}</span>
              <span className="text-muted-foreground font-mono w-12 text-right">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}