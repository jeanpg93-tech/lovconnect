import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Store, Terminal, Hand, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import PeriodFilter, { PeriodKey, computeRange } from "./PeriodFilter";

type Channel = "manual" | "api" | "storefront";

function readChannel(notes: string | null | undefined): Channel {
  if (!notes) return "manual";
  try {
    const o = JSON.parse(notes);
    const s = o?.source;
    if (s === "api" || s === "unified_api") return "api";
    if (s === "storefront") return "storefront";
    return "manual";
  } catch {
    return "manual";
  }
}

export default function ChannelStatsCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PeriodKey>("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [stats, setStats] = useState({ manual: 0, api: 0, storefront: 0, total: 0 });

  const range = useMemo(() => computeRange(filter, customFrom, customTo), [filter, customFrom, customTo]);

  useEffect(() => {
    if (!user?.id || !range) { setLoading(false); return; }
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
        if (!resellerId) { setStats({ manual: 0, api: 0, storefront: 0, total: 0 }); return; }
        const { data } = await supabase
          .from("orders")
          .select("notes")
          .eq("reseller_id", resellerId)
          .eq("is_test", false)
          .in("status", ["completed", "sucesso", "manual_concluido", "manual_entregue"])
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString())
          .limit(5000);
        if (cancelled) return;
        let manual = 0, api = 0, storefront = 0;
        for (const r of (data ?? []) as { notes: string | null }[]) {
          const c = readChannel(r.notes);
          if (c === "api") api++;
          else if (c === "storefront") storefront++;
          else manual++;
        }
        setStats({ manual, api, storefront, total: manual + api + storefront });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, range?.from?.getTime(), range?.to?.getTime()]);

  const items = [
    { key: "storefront", label: "Loja Pública", value: stats.storefront, Icon: Store,
      cls: "border-blue-500/30 bg-blue-500/5 text-blue-500" },
    { key: "api", label: "API", value: stats.api, Icon: Terminal,
      cls: "border-purple-500/30 bg-purple-500/5 text-purple-500" },
    { key: "manual", label: "Manual", value: stats.manual, Icon: Hand,
      cls: "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            ▸ Canais de venda
          </div>
          <div className="text-sm font-bold mt-0.5">{range?.label ?? "Selecione um período"}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodFilter
            value={filter}
            onChange={setFilter}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          <div className="text-right pl-2 border-l border-border ml-1">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Total</div>
            <div className="text-base font-mono font-black leading-tight">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : stats.total}
            </div>
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
    </div>
  );
}