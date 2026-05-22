import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PricingIssue } from "@/hooks/usePricingIssues";

export type ResellerWithIssues = {
  reseller_id: string;
  display_name: string;
  slug: string;
  issues: PricingIssue[];
  has_critical: boolean;
  has_warning: boolean;
};

export type AllPricingIssuesResponse = {
  scope: "all";
  resellers: ResellerWithIssues[];
  total_resellers_with_issues: number;
  has_critical: boolean;
  has_warning: boolean;
};

export function useAllPricingIssues(opts: { pollMs?: number; enabled?: boolean } = {}) {
  const { user } = useAuth();
  const enabled = opts.enabled !== false;
  const [data, setData] = useState<AllPricingIssuesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !enabled) {
      setLoading(false);
      return;
    }
    try {
      const { data: res, error } = await supabase.functions.invoke<AllPricingIssuesResponse>(
        "pricing-issues",
        { method: "POST", body: { scan: "all" } },
      );
      if (!error && res) setData(res);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, enabled]);

  useEffect(() => {
    refresh();
    if (!opts.pollMs || !enabled) return;
    const t = setInterval(refresh, opts.pollMs);
    return () => clearInterval(t);
  }, [refresh, opts.pollMs, enabled]);

  return {
    resellers: data?.resellers ?? [],
    total: data?.total_resellers_with_issues ?? 0,
    hasCritical: data?.has_critical ?? false,
    hasWarning: data?.has_warning ?? false,
    loading,
    refresh,
  };
}