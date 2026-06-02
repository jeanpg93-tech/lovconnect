import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Package, Wallet, AlertTriangle, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format, startOfDay, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { readOriginFromNotes } from "./OriginBadge";

type FilterKey = "today" | "7d" | "30d" | "month" | "custom";

const FILTER_LABELS: Record<FilterKey, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  custom: "Período personalizado",
};

export default function OriginStatsCard() {
  const { user } = useAuth();
  const { billingMode } = useRole();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [stats, setStats] = useState({ pack: 0, wallet: 0, fallback: 0, total: 0 });

  const range = useMemo<{ from: Date; to: Date; label: string } | null>(() => {
    const now = new Date();
    if (filter === "today") return { from: startOfDay(now), to: now, label: "Hoje" };
    if (filter === "7d") return { from: subDays(now, 7), to: now, label: "Últimos 7 dias" };
    if (filter === "30d") return { from: subDays(now, 30), to: now, label: "Últimos 30 dias" };
    if (filter === "month") return { from: startOfMonth(now), to: now, label: "Este mês" };
    if (filter === "custom" && customFrom && customTo) {
      const to = new Date(customTo); to.setHours(23, 59, 59, 999);
      return {
        from: startOfDay(customFrom),
        to,
        label: `${format(customFrom, "dd/MM", { locale: ptBR })} – ${format(customTo, "dd/MM", { locale: ptBR })}`,
      };
    }
    return null;
  }, [filter, customFrom, customTo]);

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
        if (!resellerId) { setStats({ pack: 0, wallet: 0, fallback: 0, total: 0 }); return; }
        const { data } = await supabase
          .from("orders")
          .select("notes,status,is_test")
          .eq("reseller_id", resellerId)
          .eq("is_test", false)
          .in("status", ["completed", "sucesso", "manual_concluido", "manual_entregue"])
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString())
          .limit(2000);
        if (cancelled) return;
        const rows = (data ?? []) as { notes: string | null }[];
        let pack = 0, wallet = 0, fallback = 0;
        for (const r of rows) {
          const o = readOriginFromNotes(r.notes);
          if (o === "pack") pack++;
          else if (o === "wallet_fallback") fallback++;
          else if (o === "wallet") wallet++;
          // unknown -> ignora
        }
        const total = pack + wallet + fallback;
        setStats({ pack, wallet, fallback, total });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, range?.from?.getTime(), range?.to?.getTime()]);

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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            ▸ Origem das vendas
          </div>
          <div className="text-sm font-bold mt-0.5">{range?.label ?? "Selecione um período"}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">{FILTER_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filter === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customFrom && customTo
                    ? `${format(customFrom, "dd/MM", { locale: ptBR })} – ${format(customTo, "dd/MM", { locale: ptBR })}`
                    : "Escolher datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: customFrom, to: customTo }}
                  onSelect={(r: any) => {
                    setCustomFrom(r?.from);
                    setCustomTo(r?.to);
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
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