import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

export type DateRange = "all" | "today" | "week" | "month" | "custom";
export type CustomRange = { from: Date; to: Date };

const GATEWAY_FEE_CENTS_PER_RECHARGE = 50;

function rangeWindow(
  range: DateRange,
  custom?: CustomRange,
): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (range === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s, end: null };
  }
  if (range === "week") {
    const s = new Date(now); s.setDate(s.getDate() - 7);
    return { start: s, end: null };
  }
  if (range === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
  }
  if (range === "custom" && custom?.from) {
    const s = new Date(custom.from); s.setHours(0, 0, 0, 0);
    const e = new Date(custom.to ?? custom.from); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  return { start: null, end: null };
}

export type FinancialOverview = {
  revenueCents: number;
  rechargesRevenueCents: number;
  manualRevenueCents: number;
  activationRevenueCents: number;
  activationsCount: number;
  subscriptionRevenueCents: number;
  subscriptionCount: number;
  packRevenueCents: number;
  packCount: number;
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

export function useFinancialOverview(range: DateRange, customRange?: CustomRange) {
  const [data, setData] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = rangeWindow(range, customRange);
    const startIso = start?.toISOString();
    const endIso = end?.toISOString();

    // Receita: recharge_intents paid
    let rQ = supabase
      .from("recharge_intents")
      .select("amount_cents, paid_at, reseller_id")
      .eq("status", "paid");
    if (startIso) rQ = rQ.gte("paid_at", startIso);
    if (endIso) rQ = rQ.lte("paid_at", endIso);
    const { data: recharges } = await rQ;
    const rechargesArr = recharges || [];
    const rechargesRevenueCents = rechargesArr.reduce((s, r: any) => s + Number(r.amount_cents || 0), 0);
    const rechargesCount = rechargesArr.length;
    const gatewayFeeCents = rechargesCount * GATEWAY_FEE_CENTS_PER_RECHARGE;

    // Receita: activation_payments (ativação do painel pelos novos revendedores)
    let apQ = supabase
      .from("activation_payments")
      .select("amount_cents, paid_at")
      .in("status", ["paid", "approved"]);
    if (startIso) apQ = apQ.gte("paid_at", startIso);
    if (endIso) apQ = apQ.lte("paid_at", endIso);
    const { data: activations } = await apQ;
    const activationsArr = activations || [];
    const activationRevenueCents = activationsArr.reduce((s, a: any) => s + Number(a.amount_cents || 0), 0);
    const activationsCount = activationsArr.length;

    // Receita: mensalidades pagas (reseller_subscription_charges)
    let scQ = supabase
      .from("reseller_subscription_charges")
      .select("amount_cents, paid_at")
      .eq("status", "paid");
    if (startIso) scQ = scQ.gte("paid_at", startIso);
    if (endIso) scQ = scQ.lte("paid_at", endIso);
    const { data: subsCharges } = await scQ;
    const subsArr = subsCharges || [];
    const subscriptionRevenueCents = subsArr.reduce((s, a: any) => s + Number(a.amount_cents || 0), 0);
    const subscriptionCount = subsArr.length;

    // Receita: pacotes pagos por revendedores Pack (reseller_pack_purchases)
    let ppQ = supabase
      .from("reseller_pack_purchases")
      .select("price_cents, paid_at")
      .eq("status", "paid");
    if (startIso) ppQ = ppQ.gte("paid_at", startIso);
    if (endIso) ppQ = ppQ.lte("paid_at", endIso);
    const { data: packPurchases } = await ppQ;
    const packArr = packPurchases || [];
    const packRevenueCents = packArr.reduce((s, a: any) => s + Number(a.price_cents || 0), 0);
    const packCount = packArr.length;

    // Custo: storefront_orders pagos
    let soQ = supabase
      .from("storefront_orders")
      .select("cost_cents, paid_at, created_at, reseller_id, status, product_type, credit_amount")
      .in("status", ["paid", "completed", "delivered", "manual_concluido", "manual_aceito"]);
    if (startIso) soQ = soQ.gte("paid_at", startIso);
    if (endIso) soQ = soQ.lte("paid_at", endIso);
    const { data: storeOrders } = await soQ;
    const soArr = storeOrders || [];

    // Custo: reseller_credit_purchases bem-sucedidas
    let rcpQ = supabase
      .from("reseller_credit_purchases")
      .select("cost_cents, created_at, reseller_id, status, credits")
      .in("status", ["sucesso", "manual_aceito", "manual_concluido"]);
    if (startIso) rcpQ = rcpQ.gte("created_at", startIso);
    if (endIso) rcpQ = rcpQ.lte("created_at", endIso);
    const { data: creditPurchases } = await rcpQ;
    const rcpArr = creditPurchases || [];

    // ========================================================================
    // CUSTO REAL DO DONO PARA RECARGAS DE CRÉDITO
    // O campo cost_cents nessas tabelas guarda o que o REVENDEDOR paga ao dono
    // (receita do dono), não o custo real do provedor upstream. O custo real é
    // o "Preço Base" (credit_pricing_plans.price_cents). Como esse valor pode
    // estar vazio no DB, buscamos via lovable-credits-api?action=quote, que é
    // a mesma fonte usada na página de Valores das Recargas.
    // ========================================================================
    const creditAmounts = new Set<number>();
    soArr.forEach((o: any) => {
      if (o.product_type === "credits" && o.credit_amount > 0) creditAmounts.add(Number(o.credit_amount));
    });
    rcpArr.forEach((o: any) => {
      if (o.credits > 0) creditAmounts.add(Number(o.credits));
    });

    const baseCostMap: Record<number, number> = {};
    if (creditAmounts.size > 0) {
      // 1) Fonte principal: Preço Base salvo em credit_pricing_plans (editável em /painel/gerente/recargas)
      const { data: plans } = await supabase
        .from("credit_pricing_plans")
        .select("credits_amount, price_cents")
        .eq("is_active", true);
      (plans || []).forEach((p: any) => {
        if (p.price_cents > 0) baseCostMap[Number(p.credits_amount)] = Number(p.price_cents);
      });
      // 2) Fallback: cotação ao vivo do provedor, apenas para pacotes sem Preço Base salvo
      const missing = Array.from(creditAmounts).filter((c) => !(baseCostMap[c] > 0));
      await Promise.all(
        missing.map(async (credits) => {
          try {
            const { data, error } = await invokeAuthenticatedFunction(
              `lovable-credits-api?action=quote&credits=${credits}`,
              { method: "GET" },
            );
            if (error) return;
            const cents =
              data?.data?.precoCentavos ??
              data?.precoCentavos ??
              (typeof data?.data?.precoReais === "string"
                ? Math.round(parseFloat(data.data.precoReais) * 100)
                : null);
            if (typeof cents === "number" && !isNaN(cents) && cents > 0) {
              baseCostMap[credits] = cents;
            }
          } catch {
            // ignora — usa fallback
          }
        }),
      );
    }

    const ownerCostForSoItem = (o: any): number => {
      if (o.product_type === "credits" && o.credit_amount > 0) {
        return baseCostMap[Number(o.credit_amount)] ?? 0;
      }
      // Licenças e outros: mantém cost_cents atual
      return Number(o.cost_cents || 0);
    };
    const ownerCostForRcpItem = (o: any): number => {
      if (o.credits > 0) return baseCostMap[Number(o.credits)] ?? 0;
      return Number(o.cost_cents || 0);
    };

    const costCreditsCents =
      soArr.reduce((s, o: any) => s + ownerCostForSoItem(o), 0) +
      rcpArr.reduce((s, o: any) => s + ownerCostForRcpItem(o), 0);
    const salesCount = soArr.length + rcpArr.length;

    // Lançamentos manuais
    let mQ = supabase
      .from("manual_financial_entries")
      .select("entry_type, amount_cents, cost_cents, entry_date");
    if (startIso) mQ = mQ.gte("entry_date", startIso);
    if (endIso) mQ = mQ.lte("entry_date", endIso);
    const { data: manuals } = await mQ;
    const manualArr = manuals || [];
    const manualRevenueCents = manualArr
      .filter((m: any) => m.entry_type === "revenue")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    const manualExpenseCents = manualArr
      .filter((m: any) => m.entry_type === "expense")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    // Custo embutido nas receitas manuais (ex: venda de pacote de créditos por fora)
    const manualRevenueCostCents = manualArr
      .filter((m: any) => m.entry_type === "revenue")
      .reduce((s, m: any) => s + Number(m.cost_cents || 0), 0);

    const revenueCents =
      rechargesRevenueCents + manualRevenueCents + activationRevenueCents + subscriptionRevenueCents + packRevenueCents;
    const costCents = costCreditsCents + gatewayFeeCents + manualExpenseCents + manualRevenueCostCents;
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
    activationsArr.forEach((a: any) => {
      const k = key(a.paid_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].revenue += Number(a.amount_cents || 0);
    });
    subsArr.forEach((a: any) => {
      const k = key(a.paid_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].revenue += Number(a.amount_cents || 0);
    });
    packArr.forEach((a: any) => {
      const k = key(a.paid_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].revenue += Number(a.price_cents || 0);
    });
    soArr.forEach((o: any) => {
      const k = key(o.paid_at || o.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].cost += ownerCostForSoItem(o);
    });
    rcpArr.forEach((o: any) => {
      const k = key(o.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].cost += ownerCostForRcpItem(o);
    });
    manualArr.forEach((m: any) => {
      const k = key(m.entry_date);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      if (m.entry_type === "revenue") {
        bucket[k].revenue += Number(m.amount_cents || 0);
        bucket[k].cost += Number(m.cost_cents || 0);
      } else {
        bucket[k].cost += Number(m.amount_cents || 0);
      }
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
      perReseller[id].cost += ownerCostForSoItem(o);
      perReseller[id].sales += 1;
    });
    rcpArr.forEach((o: any) => {
      const id = o.reseller_id;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].cost += ownerCostForRcpItem(o);
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
      activationRevenueCents,
      activationsCount,
      subscriptionRevenueCents,
      subscriptionCount,
      packRevenueCents,
      packCount,
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
  }, [range, customRange?.from?.getTime(), customRange?.to?.getTime()]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}