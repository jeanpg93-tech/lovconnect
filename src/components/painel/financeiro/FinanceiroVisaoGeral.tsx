import { useFinancialOverview, type DateRange } from "@/hooks/useFinancialOverview";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Percent,
  ShoppingCart,
  Receipt,
  Loader2,
  Users,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const brlSigned = (cents: number, sign: "+" | "-" | "auto" = "auto") => {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (sign === "+") return `+ ${formatted}`;
  if (sign === "-") return `− ${formatted}`;
  if (cents < 0) return `− ${formatted}`;
  return `+ ${formatted}`;
};

const COLOR_REVENUE = "#10b981"; // emerald
const COLOR_COST = "#ef4444"; // red
const COLOR_PROFIT = "#0ea5e9"; // sky-500

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
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Receita Total"
          value={brlSigned(data.revenueCents, "+")}
          icon={TrendingUp}
          hint="Recargas + manuais"
          color="emerald"
        />
        <KpiCard
          label="Custo Total"
          value={brlSigned(data.costCents, "-")}
          icon={TrendingDown}
          hint="Créditos + taxas + gastos"
          color="red"
        />
        <KpiCard
          label="Lucro Líquido"
          value={brlSigned(data.profitCents, data.profitCents >= 0 ? "+" : "-")}
          icon={Wallet}
          hint={`Margem ${data.marginPct.toFixed(1)}%`}
          color="sky"
        />
        <KpiCard
          label="Margem"
          value={`${data.marginPct.toFixed(1)}%`}
          icon={Percent}
          hint="Lucro / Receita"
          color="sky"
        />
        <KpiCard
          label="Recargas"
          value={String(data.rechargesCount)}
          icon={Receipt}
          hint="Depósitos pagos"
          color="violet"
        />
        <KpiCard
          label="Vendas"
          value={String(data.salesCount)}
          icon={ShoppingCart}
          hint="Créditos vendidos"
          color="amber"
        />
      </div>

      {/* Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CompositionCard
          title="Composição do Custo"
          icon={TrendingDown}
          total={data.costCents}
          accent={COLOR_COST}
          asNegative
          items={[
            { label: "Créditos vendidos", hint: "custo do provedor", value: data.costCreditsCents, color: "#3b82f6" },
            { label: "Taxa gateway", hint: "R$ 0,50 / recarga", value: data.gatewayFeeCents, color: "#f59e0b" },
            { label: "Gastos manuais", hint: "lançamentos manuais", value: data.manualExpenseCents, color: "#f97316" },
          ]}
        />
        <CompositionCard
          title="Composição da Receita"
          icon={TrendingUp}
          total={data.revenueCents}
          accent={COLOR_REVENUE}
          items={[
            { label: "Recargas pagas", hint: "revendedores", value: data.rechargesRevenueCents, color: COLOR_REVENUE },
            { label: "Receitas manuais", hint: "lançamentos manuais", value: data.manualRevenueCents, color: "#8b5cf6" },
          ]}
        />
      </div>

      {/* Chart */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-base font-bold">Evolução Financeira</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Margem do período: <span className="font-mono font-bold text-sky-500">{data.marginPct.toFixed(1)}%</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Receita</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Custo</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />Lucro</span>
          </div>
        </div>
        {data.series.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground italic text-sm">Sem dados no período</div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_REVENUE} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={COLOR_REVENUE} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_COST} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COLOR_COST} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_PROFIT} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={COLOR_PROFIT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${v.toFixed(0)}`} />
                <Tooltip
                  content={<ChartTooltip />}
                />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke={COLOR_REVENUE} strokeWidth={2} fill="url(#gradRevenue)" />
                <Area type="monotone" dataKey="cost" name="Custo" stroke={COLOR_COST} strokeWidth={2} fill="url(#gradCost)" />
                <Area type="monotone" dataKey="profit" name="Lucro" stroke={COLOR_PROFIT} strokeWidth={2.5} fill="url(#gradProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Reseller sales */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Vendas por Revendedor
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Quanto cada revendedor gerou de receita, custo (descontado de você) e lucro líquido.
            </p>
          </div>
        </div>
        {data.resellerSales.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground italic text-sm">Sem dados no período</div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <th className="text-left font-bold py-2 px-2">Revendedor</th>
                  <th className="text-right font-bold py-2 px-2">Vendas</th>
                  <th className="text-right font-bold py-2 px-2">Receita</th>
                  <th className="text-right font-bold py-2 px-2">Custo (você)</th>
                  <th className="text-right font-bold py-2 px-2">Lucro</th>
                  <th className="text-right font-bold py-2 px-2">Margem</th>
                </tr>
              </thead>
              <tbody>
                {data.resellerSales.map((r) => {
                  const margin = r.revenue_cents > 0 ? (r.profit_cents / r.revenue_cents) * 100 : 0;
                  return (
                    <tr key={r.reseller_id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-2 font-semibold truncate max-w-[200px]">{r.display_name}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">{r.sales_count}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-500">{brlSigned(r.revenue_cents, "+")}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-500">{brlSigned(r.cost_cents, "-")}</td>
                      <td className={`py-2.5 px-2 text-right font-mono font-black tabular-nums ${r.profit_cents >= 0 ? "text-sky-500" : "text-red-500"}`}>{brlSigned(r.profit_cents, r.profit_cents >= 0 ? "+" : "-")}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  total,
  items,
  accent,
  asNegative,
}: {
  title: string;
  total: number;
  accent: string;
  items: Array<{ label: string; hint?: string; value: number; color: string }>;
  asNegative?: boolean;
}) {
  const size = 140;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((it) => {
    const pct = total > 0 ? it.value / total : 0;
    const dash = pct * circ;
    const seg = { ...it, pct, dash, offset };
    offset += dash;
    return seg;
  });
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-display text-base font-bold mb-4">{title}</h3>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
            {total > 0 &&
              segments.map((s, i) => (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${s.dash} ${circ - s.dash}`}
                  strokeDashoffset={-s.offset}
                  strokeLinecap="butt"
                />
              ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
            <span className="font-mono font-black text-base tabular-nums" style={{ color: accent }}>
              {asNegative ? brlSigned(total, "-") : brlSigned(total, "+")}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          {segments.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="flex-1 font-semibold truncate">{s.label}</span>
                <span className="font-mono font-black tabular-nums" style={{ color: s.color }}>
                  {asNegative ? brlSigned(s.value, "-") : brlSigned(s.value, "+")}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.pct * 100}%`, background: s.color }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{(s.pct * 100).toFixed(0)}%</span>
              </div>
              {s.hint && <p className="text-[10px] text-muted-foreground pl-4">{s.hint}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}