import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/painel/PageHeader";

/**
 * Card de métrica para o gerente: total de vendas que caíram de Pack
 * para Saldo (fallback automático) nos últimos N dias.
 */
export default function FallbackMetricCard({ days = 30 }: { days?: number }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { count: c } = await supabase
        .from("storefront_orders")
        .select("id", { count: "exact", head: true })
        .eq("fallback_from_pack", true)
        .gte("created_at", since.toISOString());
      if (!cancelled) setCount(c ?? 0);
    })();
    return () => { cancelled = true; };
  }, [days]);

  return (
    <StatCard
      label="Vendas em Fallback"
      value={count ?? "—"}
      hint={`Pack esgotado · últimos ${days}d`}
      icon={AlertTriangle}
      accent="amber"
    />
  );
}