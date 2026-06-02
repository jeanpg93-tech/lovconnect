import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Package, Wallet, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  delivery_source: string | null;
  fallback_from_pack: boolean | null;
};

/**
 * Card que exibe a divisão das últimas vendas do revendedor entre
 * Pacote, Saldo e Fallback (pacote esgotado). Aparece no dashboard
 * do revendedor para dar visibilidade dos modos de entrega ativos.
 */
export default function OriginStatsCard({ days = 7 }: { days?: number }) {
  const { user } = useAuth();
  const { billingMode } = useRole();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pack: 0, wallet: 0, fallback: 0, total: 0 });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rsl } = await supabase
          .from("resellers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        const resellerId = (rsl as any)?.id;
        if (!resellerId) { setStats({ pack: 0, wallet: 0, fallback: 0, total: 0 }); return; }
        const since = new Date();
        since.setDate(since.getDate() - days);
        const { data } = await supabase
          .from("storefront_orders")
          .select("delivery_source,fallback_from_pack")
          .eq("reseller_id", resellerId)
          .in("status", ["paid", "completed"])
          .gte("created_at", since.toISOString())
          .limit(1000);
        if (cancelled) return;
        const rows = (data ?? []) as Row[];
        let pack = 0, wallet = 0, fallback = 0;
        for (const r of rows) {
          if (r.delivery_source === "pack") pack++;
          else if (r.delivery_source === "wallet_fallback" || r.fallback_from_pack) fallback++;
          else wallet++;
        }
        setStats({ pack, wallet, fallback, total: rows.length });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, days]);

  if (billingMode !== "pack") return null;

  const items = [
    { key: "pack", label: "Pacote", value: stats.pack, Icon: Package,
      cls: "border-primary/30 bg-primary/5 text-primary" },
    { key: "wallet", label: "Saldo", value: stats.wallet, Icon: Wallet,
      cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500" },
    { key: "fallback", label: "Fallback p/ Saldo", value: stats.fallback, Icon: AlertTriangle,
      cls: "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            ▸ Origem das vendas
          </div>
          <div className="text-sm font-bold mt-0.5">Últimos {days} dias</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div className="text-lg font-mono font-black">
            {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : stats.total}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div
            key={it.key}
            className={cn("rounded-xl border p-3 flex flex-col gap-1", it.cls)}
          >
            <div className="flex items-center gap-1.5">
              <it.Icon className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase tracking-widest font-bold">{it.label}</span>
            </div>
            <div className="text-xl font-mono font-black">
              {loading ? "—" : it.value}
            </div>
          </div>
        ))}
      </div>
      {stats.fallback > 0 && !loading && (
        <div className="mt-3 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {stats.fallback} venda{stats.fallback > 1 ? "s" : ""} caíram para o saldo
            porque o pacote estava esgotado. Recarregue para evitar débito da carteira.
          </span>
        </div>
      )}
    </div>
  );
}