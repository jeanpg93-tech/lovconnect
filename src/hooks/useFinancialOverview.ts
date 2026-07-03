import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

export type DateRange = "all" | "today" | "week" | "month" | "custom";
export type CustomRange = { from: Date; to: Date };

// A taxa MisticPay agora é lançada AUTOMATICAMENTE no Financeiro pelo webhook
// (manual_financial_entries com reference_kind='misticpay_fee'). Mantemos a constante
// em 0 para evitar dupla contagem — o cálculo real vem de `manualMisticFeeCents`.
const GATEWAY_FEE_CENTS_PER_RECHARGE = 0;

const brtDayKey = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export function rangeWindow(
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
  lovastoreRevenueCents: number;
  lovastoreCount: number;
  activationRevenueCents: number;
  activationsCount: number;
  subscriptionRevenueCents: number;
  subscriptionCount: number;
  packRevenueCents: number;
  packCount: number;
  rechargePlanRevenueCents: number;
  rechargePlanCostCents: number;
  rechargePlanCount: number;
  claudeCount: number;
  claudeGrossSalesCents: number;      // preço pago pelos clientes finais (informativo)
  claudeOwnerRevenueCents: number;    // saldo debitado do revendedor (= receita do dono via Claude, já parte de recargas)
  claudeSupplierCostCents: number;    // custo real do dono (fornecedor)
  claudeManualProfitCents: number;    // lucro das vendas manuais de Claude (amount - cost)
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
  resellerSalesDetails: Record<string, Array<{
    id: string;
    date: string;
    kind: "credits_storefront" | "credits_api" | "license_storefront" | "recharge" | "pack" | "recharge_plan" | "claude";
    description: string;
    revenue_cents: number;
    cost_cents: number;
    profit_cents: number;
  }>>;
};

export function useFinancialOverview(range: DateRange, customRange?: CustomRange) {
  const [data, setData] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = rangeWindow(range, customRange);
    const startIso = start?.toISOString();
    const endIso = end?.toISOString();

    // Buscar IDs de revendedores demo para EXCLUIR de todas as agregações
    const { data: demoRows } = await supabase.from("resellers").select("id").eq("is_demo", true);
    const demoIds = ((demoRows ?? []) as any[]).map((r) => r.id);
    const excludeDemos = (q: any, col = "reseller_id") =>
      demoIds.length ? q.not(col, "in", `(${demoIds.join(",")})`) : q;

    // Receita: recharge_intents paid
    let rQ = supabase
      .from("recharge_intents")
      .select("amount_cents, paid_at, reseller_id")
      .eq("status", "paid");
    if (startIso) rQ = rQ.gte("paid_at", startIso);
    if (endIso) rQ = rQ.lte("paid_at", endIso);
    rQ = excludeDemos(rQ);
    const { data: recharges } = await rQ;
    const rechargesArr = recharges || [];
    const rechargesRevenueCents = rechargesArr.reduce((s, r: any) => s + Number(r.amount_cents || 0), 0);
    const rechargesCount = rechargesArr.length;
    const gatewayFeeCents = 0; // taxa real vem de manualMisticFeeCents

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
    scQ = excludeDemos(scQ);
    const { data: subsCharges } = await scQ;
    const subsArr = subsCharges || [];
    const subscriptionRevenueCents = subsArr.reduce((s, a: any) => s + Number(a.amount_cents || 0), 0);
    const subscriptionCount = subsArr.length;

    // Receita: pacotes pagos por revendedores Pack (reseller_pack_purchases)
    let ppQ = supabase
      .from("reseller_pack_purchases")
      .select("price_cents, paid_at, reseller_id")
      .eq("status", "paid");
    if (startIso) ppQ = ppQ.gte("paid_at", startIso);
    if (endIso) ppQ = ppQ.lte("paid_at", endIso);
    ppQ = excludeDemos(ppQ);
    const { data: packPurchases } = await ppQ;
    const packArr = packPurchases || [];
    const packRevenueCents = packArr.reduce((s, a: any) => s + Number(a.price_cents || 0), 0);
    const packCount = packArr.length;

    // Planos de recarga vendidos (subscriptions não canceladas no período)
    // Receita do dono = cost_cents (o que o revendedor pagou em saldo, vindo de recargas)
    // Custo do dono = platform_cost_cents do plano (fornecedor)
    let { data: planSubsRaw, error: planSubsErr } = await supabase.rpc(
      "admin_reseller_recharge_plan_subscriptions_costs" as any,
      { _from: startIso ?? null, _to: endIso ?? null },
    );
    if (planSubsErr || !planSubsRaw) {
      // Fallback: tabela direta (caso a RPC falhe por permissão/timeout)
      console.warn("[financeiro] plansubs RPC falhou, usando fallback", planSubsErr);
      let q = supabase
        .from("reseller_recharge_plan_subscriptions_admin" as any)
        .select("cost_cents, plan_id, started_at, created_at, status, reseller_id");
      if (startIso) q = q.gte("created_at", startIso);
      if (endIso) q = q.lt("created_at", endIso);
      const { data: fb } = await q;
      planSubsRaw = fb as any;
    }
    const planSubsArr = (((planSubsRaw as any[]) || [])
      .filter((s: any) => s.status !== "cancelled")
      .filter((s: any) => !demoIds.includes(s.reseller_id))) as any[];
    const planIds = Array.from(new Set(planSubsArr.map((s) => s.plan_id).filter(Boolean)));
    const platformCostByPlan: Record<string, number> = {};
    if (planIds.length) {
      const { data: planRows } = await supabase.rpc("gerente_list_recharge_plans" as any);
      ((planRows as any[]) || []).filter((p: any) => planIds.includes(p.id)).forEach((p: any) => {
        platformCostByPlan[p.id] = Number(p.platform_cost_cents || 0);
      });
    }
    const rechargePlanRevenueCents = planSubsArr.reduce((s, p) => s + Number(p.cost_cents || 0), 0);
    const rechargePlanCostCents = planSubsArr.reduce(
      (s, p) => s + (platformCostByPlan[p.plan_id] ?? 0),
      0,
    );
    const rechargePlanCount = planSubsArr.length;

    // ========================================================================
    // CLAUDE: chaves emitidas no período
    //  - sale_price_cents = valor que o cliente final pagou ao revendedor (informativo)
    //  - cost_cents       = saldo debitado do revendedor = receita do dono via Claude
    //                       (já contabilizada dentro de "Recargas" — informativa aqui)
    //  - custo real do dono = claude_plan_prices.cost_cents (fornecedor)
    // ========================================================================
    let coQ = supabase
      .from("claude_orders")
      .select("id, reseller_id, plan_code, sale_price_cents, cost_cents, paid_at, created_at, status, customer_name")
      .in("status", ["issued", "redeemed"]);
    if (startIso) coQ = coQ.gte("paid_at", startIso);
    if (endIso) coQ = coQ.lte("paid_at", endIso);
    coQ = excludeDemos(coQ);
    const { data: claudeRows } = await coQ;
    const claudeArr = (claudeRows || []) as any[];
    const claudePlanCodes = Array.from(new Set(claudeArr.map((c) => c.plan_code).filter(Boolean)));
    const supplierCostByPlan: Record<string, number> = {};
    if (claudePlanCodes.length) {
      // cost_cents é apenas para gerente — usa a RPC admin
      const { data: cp } = await supabase.rpc("admin_claude_plan_prices_full" as any);
      ((cp as any[]) || [])
        .filter((p) => claudePlanCodes.includes(p.plan_code))
        .forEach((p) => {
          supplierCostByPlan[p.plan_code] = Number(p.cost_cents || 0);
        });
    }
    const claudeGrossSalesCents = claudeArr.reduce((s, o) => s + Number(o.sale_price_cents || 0), 0);
    const claudeOwnerRevenueCents = claudeArr.reduce((s, o) => s + Number(o.cost_cents || 0), 0);
    const claudeSupplierCostCents = claudeArr.reduce(
      (s, o) => s + (supplierCostByPlan[o.plan_code] ?? 0),
      0,
    );
    const claudeCount = claudeArr.length;

    // Custo: storefront_orders pagos
    let soQ = supabase
      .from("storefront_orders")
      .select("id, cost_cents, paid_at, created_at, reseller_id, status, product_type, credit_amount, license_type, buyer_name, short_code, price_cents")
      .in("status", ["paid", "completed", "delivered", "manual_concluido", "manual_aceito"]);
    soQ = soQ.eq("is_test", false);
    if (startIso) soQ = soQ.gte("paid_at", startIso);
    if (endIso) soQ = soQ.lte("paid_at", endIso);
    soQ = excludeDemos(soQ);
    const { data: storeOrders } = await soQ;
    const soArr = storeOrders || [];

    // Custo: reseller_credit_purchases bem-sucedidas
    const { data: rcpRaw } = await supabase.rpc(
      "admin_reseller_credit_purchases_costs" as any,
      { _from: startIso ?? null, _to: endIso ?? null },
    );
    const rcpArr = (((rcpRaw as any[]) || [])
      .filter((r: any) => ["sucesso", "manual_aceito", "manual_concluido"].includes(r.status))
      .filter((r: any) => !demoIds.includes(r.reseller_id))) as any[];

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
      // Licenças de extensão: NÃO é custo do dono. O cost_cents aqui é o que
      // o revendedor pagou em saldo (= receita do dono já contabilizada na
      // recarga). Custo upstream real de uma chave de extensão é ~0.
      if (o.product_type === "extension") return 0;
      // Planos de recarga: o custo real (platform_cost_cents) já é contabilizado
      // separadamente em rechargePlanCostCents. Evita dupla contagem.
      if (o.product_type === "recharge_plan") return 0;
      // Outros produtos: mantém cost_cents atual
      return Number(o.cost_cents || 0);
    };
    const ownerCostForRcpItem = (o: any): number => {
      if (o.credits > 0) return baseCostMap[Number(o.credits)] ?? 0;
      return Number(o.cost_cents || 0);
    };

    const costCreditsCents =
      soArr.reduce((s, o: any) => s + ownerCostForSoItem(o), 0) +
      rcpArr.reduce((s, o: any) => s + ownerCostForRcpItem(o), 0);
    const salesCount = soArr.length + rcpArr.length + claudeCount;

    // Lançamentos manuais
    let mQ = supabase
      .from("manual_financial_entries")
      .select("entry_type, amount_cents, cost_cents, entry_date, reference_kind");
    if (startIso) mQ = mQ.gte("entry_date", startIso);
    if (endIso) mQ = mQ.lte("entry_date", endIso);
    const { data: manuals } = await mQ;
    const manualArr = manuals || [];
    const lovastoreArr = manualArr.filter(
      (m: any) => m.entry_type === "revenue" && m.reference_kind === "lovastore",
    );
    // Vendas manuais de Claude (lançadas pelo dono direto no financeiro).
    // A receita já está contabilizada em manualRevenueCents e o custo em
    // manualRevenueCostCents — aqui só extraímos os totais p/ enriquecer o
    // card do Claude (quantidade, receita bruta e lucro), sem dupla contagem.
    const claudeManualArr = manualArr.filter(
      (m: any) => m.entry_type === "revenue" && m.reference_kind === "claude",
    );
    const claudeManualRevenueCents = claudeManualArr.reduce(
      (s, m: any) => s + Number(m.amount_cents || 0),
      0,
    );
    const claudeManualCostCents = claudeManualArr.reduce(
      (s, m: any) => s + Number(m.cost_cents || 0),
      0,
    );
    const claudeManualProfitCents = claudeManualRevenueCents - claudeManualCostCents;
    const lovastoreRevenueCents = lovastoreArr.reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    const lovastoreCount = lovastoreArr.length;
    const manualRevenueCents = manualArr
      .filter((m: any) => m.entry_type === "revenue" && m.reference_kind !== "lovastore")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    // Taxas MisticPay lançadas manualmente entram no bloco "Taxa Gateway", não em Despesas
    const manualMisticFeeCents = manualArr
      .filter((m: any) => m.entry_type === "expense" && m.reference_kind === "misticpay_fee")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    const manualExpenseCents = manualArr
      .filter((m: any) => m.entry_type === "expense" && m.reference_kind !== "misticpay_fee")
      .reduce((s, m: any) => s + Number(m.amount_cents || 0), 0);
    // Custo embutido nas receitas manuais (ex: venda de pacote de créditos por fora)
    const manualRevenueCostCents = manualArr
      .filter((m: any) => m.entry_type === "revenue")
      .reduce((s, m: any) => s + Number(m.cost_cents || 0), 0);

    const revenueCents =
      rechargesRevenueCents + manualRevenueCents + lovastoreRevenueCents + activationRevenueCents + subscriptionRevenueCents + packRevenueCents + rechargePlanRevenueCents;
    const totalGatewayFeeCents = gatewayFeeCents + manualMisticFeeCents;
    const costCents = costCreditsCents + totalGatewayFeeCents + manualExpenseCents + manualRevenueCostCents + rechargePlanCostCents + claudeSupplierCostCents;
    const profitCents = revenueCents - costCents;
    const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

    // Séries diárias
    const bucket: Record<string, { revenue: number; cost: number }> = {};
    const key = brtDayKey;
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
    planSubsArr.forEach((p: any) => {
      const k = key(p.started_at || p.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].revenue += Number(p.cost_cents || 0);
      bucket[k].cost += platformCostByPlan[p.plan_id] ?? 0;
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
    claudeArr.forEach((o: any) => {
      const k = key(o.paid_at || o.created_at);
      bucket[k] = bucket[k] || { revenue: 0, cost: 0 };
      bucket[k].cost += supplierCostByPlan[o.plan_code] ?? 0;
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
    packArr.forEach((p: any) => {
      const id = p.reseller_id;
      if (!id) return;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].revenue += Number(p.price_cents || 0);
      perReseller[id].sales += 1;
    });
    planSubsArr.forEach((p: any) => {
      const id = p.reseller_id;
      if (!id) return;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].revenue += Number(p.cost_cents || 0);
      perReseller[id].cost += platformCostByPlan[p.plan_id] ?? 0;
      perReseller[id].sales += 1;
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
    claudeArr.forEach((o: any) => {
      const id = o.reseller_id;
      if (!id) return;
      perReseller[id] = perReseller[id] || { revenue: 0, cost: 0, sales: 0 };
      perReseller[id].cost += supplierCostByPlan[o.plan_code] ?? 0;
      perReseller[id].sales += 1;
    });
    // Detalhes por revendedor (para expandir cada linha)
    type Detail = FinancialOverview["resellerSalesDetails"][string][number];
    const perResellerDetails: Record<string, Detail[]> = {};
    const pushDetail = (id: string | null | undefined, d: Detail) => {
      if (!id) return;
      (perResellerDetails[id] ||= []).push(d);
    };
    rechargesArr.forEach((r: any) => {
      pushDetail(r.reseller_id, {
        id: `recharge-${r.paid_at}-${r.amount_cents}`,
        date: r.paid_at,
        kind: "recharge",
        description: `Recarga de saldo`,
        revenue_cents: Number(r.amount_cents || 0),
        cost_cents: GATEWAY_FEE_CENTS_PER_RECHARGE,
        profit_cents: Number(r.amount_cents || 0) - GATEWAY_FEE_CENTS_PER_RECHARGE,
      });
    });
    packArr.forEach((p: any) => {
      pushDetail(p.reseller_id, {
        id: `pack-${p.paid_at}-${p.price_cents}`,
        date: p.paid_at,
        kind: "pack",
        description: `Compra de Pack`,
        revenue_cents: Number(p.price_cents || 0),
        cost_cents: 0,
        profit_cents: Number(p.price_cents || 0),
      });
    });
    planSubsArr.forEach((p: any) => {
      const cost = platformCostByPlan[p.plan_id] ?? 0;
      pushDetail(p.reseller_id, {
        id: `plan-${p.id ?? p.created_at}`,
        date: p.started_at || p.created_at,
        kind: "recharge_plan",
        description: `Plano de recarga`,
        revenue_cents: Number(p.cost_cents || 0),
        cost_cents: cost,
        profit_cents: Number(p.cost_cents || 0) - cost,
      });
    });
    soArr.forEach((o: any) => {
      const cost = ownerCostForSoItem(o);
      const isCredits = o.product_type === "credits";
      pushDetail(o.reseller_id, {
        id: `so-${o.id}`,
        date: o.paid_at || o.created_at,
        kind: isCredits ? "credits_storefront" : "license_storefront",
        description: isCredits
          ? `Loja: ${o.credit_amount ?? 0} créditos${o.buyer_name ? ` — ${o.buyer_name}` : ""}`
          : `Loja: ${o.license_type ?? "licença"}${o.buyer_name ? ` — ${o.buyer_name}` : ""}`,
        revenue_cents: Number(o.cost_cents || 0), // o que o revendedor pagou em saldo = receita do dono
        cost_cents: cost,
        profit_cents: Number(o.cost_cents || 0) - cost,
      });
    });
    rcpArr.forEach((o: any) => {
      const cost = ownerCostForRcpItem(o);
      pushDetail(o.reseller_id, {
        id: `rcp-${o.id}`,
        date: o.created_at,
        kind: "credits_api",
        description: `Créditos via API: ${o.credits ?? 0}${o.customer_name ? ` — ${o.customer_name}` : ""}`,
        revenue_cents: Number(o.cost_cents || 0),
        cost_cents: cost,
        profit_cents: Number(o.cost_cents || 0) - cost,
      });
    });
    claudeArr.forEach((o: any) => {
      const supplier = supplierCostByPlan[o.plan_code] ?? 0;
      const ownerRev = Number(o.cost_cents || 0);
      pushDetail(o.reseller_id, {
        id: `claude-${o.id}`,
        date: o.paid_at || o.created_at,
        kind: "claude",
        description: `Claude ${o.plan_code}${o.customer_name ? ` — ${o.customer_name}` : ""}`,
        revenue_cents: ownerRev,
        cost_cents: supplier,
        profit_cents: ownerRev - supplier,
      });
    });
    Object.values(perResellerDetails).forEach((arr) =>
      arr.sort((a, b) => (a.date < b.date ? 1 : -1)),
    );

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
      lovastoreRevenueCents,
      lovastoreCount,
      activationRevenueCents,
      activationsCount,
      subscriptionRevenueCents,
      subscriptionCount,
      packRevenueCents,
      packCount,
      rechargePlanRevenueCents,
      rechargePlanCostCents,
      rechargePlanCount,
      claudeCount,
      claudeGrossSalesCents,
      claudeOwnerRevenueCents,
      claudeSupplierCostCents,
      claudeManualProfitCents,
      costCents,
      costCreditsCents,
      gatewayFeeCents: totalGatewayFeeCents,
      manualExpenseCents,
      profitCents,
      marginPct,
      rechargesCount,
      salesCount,
      series,
      topResellers,
      resellerSales,
      resellerSalesDetails: perResellerDetails,
    });
    setLoading(false);
  }, [range, customRange?.from?.getTime(), customRange?.to?.getTime()]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}