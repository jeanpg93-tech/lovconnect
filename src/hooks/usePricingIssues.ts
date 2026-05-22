import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PricingIssueReason = "cost_missing" | "sale_missing" | "sale_below_cost" | "margin_zero";
export type PricingIssueSeverity = "warning" | "critical";

export type PricingIssue = {
  kind: "license" | "credits";
  method?: "flow" | "lovax";
  pack_id?: string;
  credits_amount?: number;
  label: string;
  cost_cents: number;
  sale_cents: number;
  severity: PricingIssueSeverity;
  reason: PricingIssueReason;
};

export type PricingIssuesResponse = {
  issues: PricingIssue[];
  blocked: Record<string, { severity: PricingIssueSeverity; reason: PricingIssueReason }>;
  has_blocking: boolean;
  has_critical: boolean;
};

export function reasonMessage(reason: PricingIssueReason): string {
  switch (reason) {
    case "cost_missing":
      return "Custo deste produto ainda não foi definido pelo gerente. Vendas bloqueadas até regularizar.";
    case "sale_missing":
      return "Você ativou este produto mas não cadastrou um preço de venda. Vendas bloqueadas.";
    case "sale_below_cost":
      return "Seu preço de venda está abaixo do custo. Você teria prejuízo a cada venda — vendas bloqueadas.";
    case "margin_zero":
      return "Seu preço de venda é igual ao custo. Sem lucro — vendas bloqueadas até ajustar o preço.";
  }
}

export function usePricingIssues(opts: { pollMs?: number; resellerId?: string | null } = {}) {
  const { user } = useAuth();
  const [data, setData] = useState<PricingIssuesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setData(null);
      return;
    }
    try {
      const { data: res, error } = await supabase.functions.invoke<PricingIssuesResponse>(
        "pricing-issues",
        opts.resellerId
          ? { method: "POST", body: { reseller_id: opts.resellerId } }
          : { method: "POST", body: {} },
      );
      if (!error && res) setData(res);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, opts.resellerId]);

  useEffect(() => {
    refresh();
    if (!opts.pollMs) return;
    const t = setInterval(refresh, opts.pollMs);
    return () => clearInterval(t);
  }, [refresh, opts.pollMs]);

  return {
    issues: data?.issues ?? [],
    blocked: data?.blocked ?? {},
    hasBlocking: data?.has_blocking ?? false,
    hasCritical: data?.has_critical ?? false,
    loading,
    refresh,
  };
}

/** Chave para consultar `blocked` no shape `kind:method:pack_id` ou `credits:amount`. */
export const issueKey = {
  license: (method: string, packId: string) => `license:${method}:${packId}`,
  credits: (creditsAmount: number) => `credits:${creditsAmount}`,
};