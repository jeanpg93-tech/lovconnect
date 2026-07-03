import { useState } from "react";
import { useFinancialOverview, type DateRange, type CustomRange } from "@/hooks/useFinancialOverview";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Receipt,
  Loader2,
  Users,
  Rocket,
  Repeat,
  Package,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

export default function FinanceiroVisaoGeral({ range, customRange }: { range: DateRange; customRange?: CustomRange }) {
  const { data, loading } = useFinancialOverview(range, customRange);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
          hint="Recargas + ativações + manuais"
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
          label="Ativações Painel"
          value={brlSigned(data.activationRevenueCents, "+")}
          icon={Rocket}
          hint={`${data.activationsCount} painel(éis) vendido(s)`}
          color="fuchsia"
        />
        <KpiCard
          label="Mensalidades"
          value={brlSigned(data.subscriptionRevenueCents, "+")}
          icon={Repeat}
          hint={`${data.subscriptionCount} cobrança(s) paga(s)`}
          color="sky"
        />
        <KpiCard
          label="Pacotes (Pack)"
          value={brlSigned(data.packRevenueCents, "+")}
          icon={Package}
          hint={`${data.packCount} pacote(s) pago(s)`}
          color="emerald"
        />
        <KpiCard
          label="Claude (chaves)"
          value={brlSigned(data.claudeGrossSalesCents, "+")}
          icon={ClaudeIcon}
          hint={(() => {
            const lucro = (data.claudeOwnerRevenueCents - data.claudeSupplierCostCents) + data.claudeManualProfitCents;
            return `${data.claudeCount} chave(s) · lucro ${brlSigned(lucro, lucro >= 0 ? "+" : "-")}`;
          })()}
          color="claude"
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
            { label: "Taxa gateway", hint: "R$ 0,50 / recarga", value: data.gatewayFeeCents, color: "#eab308" },
            { label: "Planos de recarga", hint: "meu custo (fornecedor)", value: data.rechargePlanCostCents, color: "#14b8a6" },
            { label: "Claude (fornecedor)", hint: `${data.claudeCount} chave(s)`, value: data.claudeSupplierCostCents, color: "#cc785c" },
            { label: "Gastos manuais", hint: "lançamentos manuais", value: data.manualExpenseCents, color: "#ec4899" },
          ]}
        />
        <CompositionCard
          title="Composição da Receita"
          icon={TrendingUp}
          total={data.revenueCents}
          accent={COLOR_REVENUE}
          items={[
            { label: "Recargas pagas", hint: "revendedores", value: data.rechargesRevenueCents, color: COLOR_REVENUE },
            { label: "Ativações Painel", hint: "novos revendedores", value: data.activationRevenueCents, color: "#d946ef" },
            { label: "Mensalidades", hint: "revendedores mensalistas", value: data.subscriptionRevenueCents, color: "#0ea5e9" },
            { label: "Pacotes (Pack)", hint: "revendedores Pack", value: data.packRevenueCents, color: "#10b981" },
            { label: "Planos de recarga", hint: `${data.rechargePlanCount} venda(s)`, value: data.rechargePlanRevenueCents, color: "#14b8a6" },
            { label: "Claude (via saldo)", hint: `${data.claudeCount} chave(s) · já inclusa em Recargas`, value: data.claudeOwnerRevenueCents, color: "#cc785c" },
            { label: "Receitas manuais", hint: "lançamentos manuais", value: data.manualRevenueCents, color: "#8b5cf6" },
            { label: "LovaStore", hint: `loja própria${data.lovastoreCount ? ` · ${data.lovastoreCount} venda(s)` : ""}`, value: data.lovastoreRevenueCents, color: "#f97316" },
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
                  const details = data.resellerSalesDetails[r.reseller_id] || [];
                  const isOpen = !!expanded[r.reseller_id];
                  return (
                    <>
                    <tr
                      key={r.reseller_id}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setExpanded((s) => ({ ...s, [r.reseller_id]: !s[r.reseller_id] }))}
                    >
                      <td className="py-2.5 px-2 font-semibold truncate max-w-[200px]">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          {r.display_name}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">{r.sales_count}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-500">{brlSigned(r.revenue_cents, "+")}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-500">{brlSigned(r.cost_cents, "-")}</td>
                      <td className={`py-2.5 px-2 text-right font-mono font-black tabular-nums ${r.profit_cents >= 0 ? "text-sky-500" : "text-red-500"}`}>{brlSigned(r.profit_cents, r.profit_cents >= 0 ? "+" : "-")}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-muted-foreground">{margin.toFixed(1)}%</td>
                    </tr>
                    {isOpen && (
                      <tr key={r.reseller_id + "-details"} className="bg-muted/10 border-b border-border/30">
                        <td colSpan={6} className="px-2 py-3">
                          {details.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground italic px-2">Sem transações detalhadas no período.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                    <th className="text-left font-bold py-1.5 px-2">Data</th>
                                    <th className="text-left font-bold py-1.5 px-2">Tipo</th>
                                    <th className="text-left font-bold py-1.5 px-2">Descrição</th>
                                    <th className="text-right font-bold py-1.5 px-2">Receita</th>
                                    <th className="text-right font-bold py-1.5 px-2">Custo</th>
                                    <th className="text-right font-bold py-1.5 px-2">Lucro</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {details.map((d) => (
                                    <tr key={d.id} className="border-t border-border/20">
                                      <td className="py-1.5 px-2 text-muted-foreground tabular-nums">
                                        {d.date ? format(new Date(d.date), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                                      </td>
                                      <td className="py-1.5 px-2">
                                        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                                          {kindLabel(d.kind)}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 truncate max-w-[280px]" title={d.description}>{d.description}</td>
                                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-emerald-500">{brlSigned(d.revenue_cents, "+")}</td>
                                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-red-500">{d.cost_cents > 0 ? brlSigned(d.cost_cents, "-") : "—"}</td>
                                      <td className={`py-1.5 px-2 text-right font-mono font-bold tabular-nums ${d.profit_cents >= 0 ? "text-sky-500" : "text-red-500"}`}>{brlSigned(d.profit_cents, d.profit_cents >= 0 ? "+" : "-")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </>
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

function kindLabel(k: string): string {
  switch (k) {
    case "recharge": return "Recarga";
    case "pack": return "Pack";
    case "recharge_plan": return "Plano";
    case "credits_storefront": return "Créditos (Loja)";
    case "credits_api": return "Créditos (API)";
    case "license_storefront": return "Licença (Loja)";
    case "claude": return "Claude";
    default: return k;
  }
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

const colorMap = {
  emerald: { text: "text-emerald-500", ring: "ring-emerald-500/25", glow: "from-emerald-500/15", bg: "bg-emerald-500/10" },
  red: { text: "text-red-500", ring: "ring-red-500/25", glow: "from-red-500/15", bg: "bg-red-500/10" },
  sky: { text: "text-sky-500", ring: "ring-sky-500/30", glow: "from-sky-500/15", bg: "bg-sky-500/10" },
  violet: { text: "text-violet-500", ring: "ring-violet-500/20", glow: "from-violet-500/10", bg: "bg-violet-500/10" },
  amber: { text: "text-amber-500", ring: "ring-amber-500/20", glow: "from-amber-500/10", bg: "bg-amber-500/10" },
  fuchsia: { text: "text-fuchsia-500", ring: "ring-fuchsia-500/25", glow: "from-fuchsia-500/15", bg: "bg-fuchsia-500/10" },
  claude: { text: "text-[#cc785c]", ring: "ring-[#cc785c]/30", glow: "from-[#cc785c]/15", bg: "bg-[#cc785c]/10" },
} as const;

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: any;
  color: keyof typeof colorMap;
}) {
  const c = colorMap[color];
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-border bg-card/50 p-3.5 ring-1 transition-all hover:bg-card/70", c.ring)}>
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-60 pointer-events-none", c.glow)} />
      <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
        <Icon className={cn("h-3.5 w-3.5", c.text)} />
        <span className="line-clamp-1">{label}</span>
      </div>
      <div className={cn("relative mt-2 font-display font-black tabular-nums leading-none text-[clamp(1.1rem,2.2vw,1.6rem)] whitespace-nowrap", c.text)}>
        {value}
      </div>
      {hint && (
        <p className="relative mt-1.5 text-[10px] text-muted-foreground leading-tight line-clamp-1">{hint}</p>
      )}
    </div>
  );
}

function CompositionCard({
  title,
  icon: Icon,
  total,
  accent,
  asNegative,
  items,
}: {
  title: string;
  icon: any;
  total: number;
  accent: string;
  asNegative?: boolean;
  items: Array<{ label: string; hint?: string; value: number; color: string }>;
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalAbs = sorted.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5" style={{ background: `${accent}1a` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
          <h3 className="font-display text-base font-bold">{title}</h3>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Total</div>
          <div className="font-mono font-black text-lg tabular-nums leading-none mt-0.5" style={{ color: accent }}>
            {asNegative ? brlSigned(total, "-") : brlSigned(total, "+")}
          </div>
        </div>
      </div>

      {/* Stacked horizontal bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted mb-4">
        {total > 0 && sorted.map((it, i) => {
          const pct = (it.value / totalAbs) * 100;
          if (pct <= 0) return null;
          return <div key={i} style={{ width: `${pct}%`, background: it.color }} className="h-full first:rounded-l-full last:rounded-r-full" />;
        })}
      </div>

      {/* Items */}
      <div className="space-y-2.5">
        {sorted.map((it, i) => {
          const pct = total > 0 ? (it.value / totalAbs) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2">
              <span className="h-7 w-1.5 rounded-full shrink-0" style={{ background: it.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{it.label}</div>
                {it.hint && <div className="text-[10px] text-muted-foreground truncate">{it.hint}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-black text-sm tabular-nums whitespace-nowrap" style={{ color: it.color }}>
                  {asNegative ? brlSigned(it.value, "-") : brlSigned(it.value, "+")}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">{pct.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => Number(payload.find((p: any) => p.dataKey === k)?.value ?? 0);
  const revenue = get("revenue");
  const cost = get("cost");
  const profit = get("profit");
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const fmt = (n: number, sign: "+" | "-" | "auto" = "auto") => {
    const abs = Math.abs(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (sign === "+") return `+ ${abs}`;
    if (sign === "-") return `− ${abs}`;
    return n < 0 ? `− ${abs}` : `+ ${abs}`;
  };
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur-sm px-3 py-2.5 shadow-xl text-xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex justify-between gap-6">
          <span className="text-emerald-500 font-semibold">Receita</span>
          <span className="text-emerald-500 font-black">{fmt(revenue, "+")}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-red-500 font-semibold">Custo</span>
          <span className="text-red-500 font-black">{fmt(cost, "-")}</span>
        </div>
        <div className="flex justify-between gap-6 border-t border-border/60 pt-1 mt-1">
          <span className="text-sky-500 font-semibold">Lucro</span>
          <span className={cn("font-black", profit >= 0 ? "text-sky-500" : "text-red-500")}>
            {fmt(profit, profit >= 0 ? "+" : "-")} <span className="text-muted-foreground font-normal">({margin.toFixed(1)}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
}