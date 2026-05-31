import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProviderCommitments = {
  committed: number;        // créditos de pack já comprados e não consumidos
  flowRemaining: number;
  lovaxRemaining: number;
  totalRemaining: number;   // soma dos métodos (pode ser Infinity)
  realAvailable: number;    // total − committed (>= 0)
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Calcula no client (gerente): estoque restante por método + créditos
 * comprometidos em packs (créditos comprados mas ainda não usados).
 */
export function useProviderCommitments(): ProviderCommitments {
  const [committed, setCommitted] = useState(0);
  const [flowRemaining, setFlowRemaining] = useState<number>(0);
  const [lovaxRemaining, setLovaxRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowRes, lovaxRes, commitRes] = await Promise.all([
        supabase.functions.invoke("provider-api?action=status", { method: "GET" }),
        supabase.functions.invoke("lovax-api?action=status", { method: "GET" }),
        supabase.rpc("get_pack_commitments"),
      ]);

      // Flow
      const fd: any = (flowRes as any)?.data ?? {};
      if (fd?.error || fd?.provider_error) {
        setFlowRemaining(0);
      } else {
        const used = Number(fd?.used ?? 0);
        const max = Number(fd?.max ?? fd?.limit ?? 0);
        setFlowRemaining(!max || max <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, max - used));
      }

      // Lovax
      const ld: any = (lovaxRes as any)?.data ?? {};
      if (ld?.error || ld?.provider_error) {
        setLovaxRemaining(0);
      } else {
        const remaining = Number(ld?.remaining ?? 0);
        setLovaxRemaining(Math.max(0, remaining));
      }

      // Comprometido em packs
      const rows: any = (commitRes as any)?.data;
      const row = Array.isArray(rows) ? rows[0] : rows;
      setCommitted(Number(row?.committed_credits ?? 0));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    const id = setInterval(() => { if (!cancelled) load(); }, 60_000);
    const ch = supabase
      .channel("pack-commitments")
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_pack_balances" }, () => load())
      .subscribe();
    return () => { cancelled = true; clearInterval(id); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRemaining = flowRemaining + lovaxRemaining;
  const realAvailable = Number.isFinite(totalRemaining)
    ? Math.max(0, totalRemaining - committed)
    : Number.POSITIVE_INFINITY;

  return {
    committed,
    flowRemaining,
    lovaxRemaining,
    totalRemaining,
    realAvailable,
    loading,
    error,
    refresh: load,
  };
}