import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DateRange = "all" | "today" | "week" | "month";

const GATEWAY_FEE_CENTS_PER_RECHARGE = 50;

function rangeStart(range: DateRange): Date | null {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

export type FinancialOverview = {
  revenueCents: number;
  rechargesRevenueCents: number;
  manualRevenueCents: number;
  costCents: number;
  costCreditsCents: number;
  gatewayFeeCents: number;
  manualExpenseCents: number;
  profitCents: number;
  marginPct: number;
  rechargesCount: number;
  salesCount: number;
  series: Array<{ date: string; revenue: number; cost: number; profit: number }>;
  topResellers: Array<{ reseller_id: string; display_name: string; profit_cents: number }>;
  resellerSales: Array<{
    reseller_id: string;
    display_name: string;
    revenue_cents: number;
    cost_cents: number;
    profit_cents: number;
    sales_count: number;
  }>;
};

export function useFinancialOverview(range: DateRange) {
  const [data, setData] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const start = rangeStart(range);
    const startIso = start?.toISOString();

    // Receita: recharge_intents paid
    let rQ = supabase
      .from("recharge_intents")
      .select("amount_cents, paid_at, reseller_id")
      .eq("status", "paid");
    if (startIso) rQ = rQ.gte("paid_at", startIso);
    const { data: recharges } = await rQ;
    const rechargesArr = recharges || [];
    const rechargesRevenueCents = rechargesArr.reduce((s, r: any) => s + Number(r.amount_cents || 0), 0);
    const rechargesCount = rechargesArr.length;
    const gatewayFeeCents = rechargesCount * GATEWAY_FEE_CENTS_PER_RECHARGE;

    // Custo: storefront_orders pagos
    let soQ = supabase
      .from("storefront_orders")
      .select("cost_cents, paid_at, created_at, reseller_id, status")
      .in("status", ["paid", "completed", "delivered", "manual_concluido", "manual_aceito"]);
    if (startIso) soQ = soQ.gte("paid_at", startIso);
    const { data: storeOrders } = await soQ;
    const soArr = storeOrders || [];

    // Custo: reseller_credit_purchases bem-sucedidas
    let rcpQ = supabase
      .from("reseller_credit_purchases")
      .select("cost_cents, created_at, reseller_id, status")
      .in("status", ["sucesso", "manual_aceito", "manual_concluido"]);
    if (startIso) rcpQ = rcpQ.gte("created_at", startIso);
    const { data: creditPurchases } = await rcpQ;
    const rcpArr = creditPurchases || [];

    const costCreditsCents =
      soArr.reduce((s, o: any) => s + Number(o.cost_cents || 0), 0) +
      rcpArr.reduce((s, o: any) => s + Number(o.cost_cents || 0), 0);
    const salesCount = soArr.length + rcpArr.length;

    // Lançamentos manuais
    let mQ = supabase
      .from("manual_financial_entries")
      .select("entry_type, amount_cents, entry_date");
    if (startIso) mQ = mQ.gte("entry_date", startIso);
    const { data: manuals } = await mQ;
    const manualArr = manuals || [];
    const manualRevenueCents = manualArr
      .filter((m: any) => m.entry_type === "revenue")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    const manualExpenseCents = manualArr
      .filter((m: any) => m.entry_type === "expense")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);

    const revenueCents = rechargesRevenueCents + manualRevenueCents;
    const costCents = costCreditsCents + gatewayFeeCents + manualExpenseCents;
    const profitCents = revenueCents - costCents;
    const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

    // Séries diárias
    const bucket: Record<string, { revenue: number; cost: number }> = {};
    const key = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
    rechargesArr.forEach((r: any) => {
      const k = key(r.paid_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].revenue += Number(r.amount_cents || 0);
      bucket[k].cost += GATEWAY_FEE_CENTS_PER_RECHARGE;
    });
    soArr.forEach((o: any) => {
      const k = key(o.paid_at || o.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].cost += Number(o.cost_cents || 0);
    });
    rcpArr.forEach((o: any) => {
      const k = key(o.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].cost += Number(o.cost_cents || 0);
    });
    manualArr.forEach((m: any) => {
      const k = key(m.entry_date);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      if (m.entry_type === "revenue") bucket[k].revenue += Number(m.amount_cents || 0);
      else bucket[k].cost += Number(m.amount_cents || 0);
    });
    const series = Object.entries(bucket)
      .filter(([k]) => k !== "—")
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({
        date,
        revenue: v.revenue / 100,
        cost: v.cost / 100,
        profit: (v.revenue - v.cost) / 100,
      }));

    // Top revendedores por lucro
    const perReseller: Record<string, { revenue: number; cost: number; sales: number }> = {};
    rechargesArr.forEach((r: any) => {
      const id = r.reseller_id;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].revenue += Number(r.amount_cents || 0);
      perReseller[id].cost += GATEWAY_FEE_CENTS_PER_RECHARGE;
    });
    soArr.forEach((o: any) => {
      const id = o.reseller_id;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].cost += Number(o.cost_cents || 0);
      perReseller[id].sales += 1;
    });
    rcpArr.forEach((o: any) => {
      const id = o.reseller_id;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].cost += Number(o.cost_cents || 0);
      perReseller[id].sales += 1;
    });
    const allEntries = Object.entries(perReseller).map(([id, v]) => ({
      id,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.revenue - v.cost,
      sales: v.sales,
    }));
    const topIds = [...allEntries].sort((a, b) => b.profit - a.profit).slice(0, 5);

    let topResellers: FinancialOverview["topResellers"] = [];
    let resellerSales: FinancialOverview["resellerSales"] = [];
    if (allEntries.length) {
      const { data: names } = await supabase
        .from("resellers")
        .select("id, display_name")
        .in("id", allEntries.map((t) => t.id));
      const nameMap = new Map((names || []).map((n: any) => [n.id, n.display_name]));
      topResellers = topIds.map((t) => ({
        reseller_id: t.id,
        display_name: nameMap.get(t.id) || "—",
        profit_cents: t.profit,
      }));
      resellerSales = allEntries
        .filter((t) => t.sales > 0 || t.cost > 0)
        .map((t) => ({
          reseller_id: t.id,
          display_name: nameMap.get(t.id) || "—",
          revenue_cents: t.revenue,
          cost_cents: t.cost,
          profit_cents: t.profit,
          sales_count: t.sales,
        }))
        .sort((a, b) => b.cost_cents - a.cost_cents);
    }

    setData({
      revenueCents,
      rechargesRevenueCents,
      manualRevenueCents,
      costCents,
      costCreditsCents,
      gatewayFeeCents,
      manualExpenseCents,
      profitCents,
      marginPct,
      rechargesCount,
      salesCount,
      series,
      topResellers,
      resellerSales,
    });
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}