import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Repeat, TrendingUp, AlertTriangle, Clock, Download, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DateRange, CustomRange } from "@/hooks/useFinancialOverview";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR"); }
  catch { return s; }
};

type Charge = {
  id: string; reseller_id: string; kind: string; description: string | null;
  amount_cents: number; due_date: string; status: string;
  paid_at: string | null; created_at: string; is_onboarding: boolean | null;
};

type Recurrence = { reseller_id: string; amount_cents: number; is_active: boolean };

const kindLabel = (k: string) =>
  k === "monthly" ? "Mensalidade" : k === "installment" ? "Parcela" : "Avulsa";

function rangeDates(range: DateRange, custom?: CustomRange): { from?: Date; to?: Date } {
  const now = new Date();
  if (range === "all") return {};
  if (range === "custom" && custom) return { from: custom.from, to: custom.to };
  if (range === "today") { const d = new Date(now); d.setHours(0,0,0,0); return { from: d, to: now }; }
  if (range === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d, to: now }; }
  if (range === "month") { const d = new Date(now.getFullYear(), now.getMonth(), 1); return { from: d, to: now }; }
  return {};
}

export default function FinanceiroMensalidades({ range, customRange }: { range: DateRange; customRange?: CustomRange }) {
  const [loading, setLoading] = useState(true);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [resellers, setResellers] = useState<Record<string, string>>({});

  // filters
  const [filterReseller, setFilterReseller] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: r }, { data: rs }] = await Promise.all([
      supabase.from("reseller_subscription_charges").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("reseller_subscription_recurrences").select("reseller_id, amount_cents, is_active"),
      supabase.from("resellers").select("id, display_name").eq("billing_mode", "subscription"),
    ]);
    setCharges((c ?? []) as any);
    setRecurrences((r ?? []) as any);
    const map: Record<string, string> = {};
    for (const it of rs ?? []) map[(it as any).id] = (it as any).display_name;
    setResellers(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // KPIs: scoped to date range when applicable
  const { from, to } = rangeDates(range, customRange);
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    if (!from && !to) return true;
    const d = new Date(iso);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const kpis = useMemo(() => {
    const mrr = recurrences.filter(r => r.is_active).reduce((s, r) => s + r.amount_cents, 0);
    let paid = 0, pending = 0, overdue = 0;
    for (const c of charges) {
      if (c.status === "paid" && inRange(c.paid_at)) paid += c.amount_cents;
      if (c.status === "pending") pending += c.amount_cents;
      if (c.status === "overdue") overdue += c.amount_cents;
    }
    return { mrr, paid, pending, overdue };
  }, [charges, recurrences, range, customRange]);

  const filtered = useMemo(() => {
    return charges.filter((c) => {
      if (filterReseller !== "all" && c.reseller_id !== filterReseller) return false;
      if (filterKind !== "all" && c.kind !== filterKind) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (search) {
        const name = (resellers[c.reseller_id] ?? "").toLowerCase();
        if (!name.includes(search.toLowerCase()) && !(c.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      }
      // Restrict by date range using paid_at when paid, else created_at
      const refDate = c.status === "paid" ? c.paid_at : c.created_at;
      if (!inRange(refDate)) return false;
      return true;
    });
  }, [charges, filterReseller, filterKind, filterStatus, search, resellers, range, customRange]);

  const exportCSV = () => {
    const rows = [
      ["Tipo", "Revendedor", "Descrição", "Valor (R$)", "Vencimento", "Status", "Pago em", "Criada em", "Onboarding"],
      ...filtered.map((c) => [
        kindLabel(c.kind),
        resellers[c.reseller_id] ?? c.reseller_id,
        c.description ?? "",
        (c.amount_cents / 100).toFixed(2).replace(".", ","),
        formatDate(c.due_date),
        c.status,
        c.paid_at ? new Date(c.paid_at).toLocaleString("pt-BR") : "",
        new Date(c.created_at).toLocaleString("pt-BR"),
        c.is_onboarding ? "sim" : "não",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mensalidades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      paid: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      overdue: "bg-rose-500/15 text-rose-500 border-rose-500/30",
      cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    };
    return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", map[s] ?? map.pending)}>{s}</span>;
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="MRR Ativo" value={brl(kpis.mrr)} hint="Soma das recorrências ativas" color="violet" icon={Repeat} />
        <Kpi label="Recebido (período)" value={brl(kpis.paid)} hint="Cobranças pagas no período" color="emerald" icon={TrendingUp} />
        <Kpi label="Em aberto" value={brl(kpis.pending)} hint="Pendentes (todos)" color="amber" icon={Clock} />
        <Kpi label="Vencido" value={brl(kpis.overdue)} hint="Atrasadas (todos)" color="rose" icon={AlertTriangle} />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Buscar revendedor ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filterReseller} onValueChange={setFilterReseller}>
            <SelectTrigger><SelectValue placeholder="Revendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os revendedores</SelectItem>
              {Object.entries(resellers).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="monthly">Mensalidade</SelectItem>
              <SelectItem value="installment">Parcela</SelectItem>
              <SelectItem value="one_off">Avulsa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Paga</SelectItem>
              <SelectItem value="overdue">Vencida</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2" disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV ({filtered.length})
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma cobrança encontrada nos filtros.</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/60">
                  <tr>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Revendedor</th>
                    <th className="px-4 py-3 text-left">Descrição</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-left">Vencimento</th>
                    <th className="px-4 py-3 text-left">Pago em</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{kindLabel(c.kind)}</span>
                          {c.is_onboarding && <Badge variant="outline" className="text-[9px]">Onboarding</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground/90">{resellers[c.reseller_id] ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground/80 max-w-xs truncate">{c.description ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{brl(c.amount_cents)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground/80">{formatDate(c.due_date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground/80">{c.paid_at ? new Date(c.paid_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-2.5">{statusBadge(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-white/5">
              {filtered.map((c) => (
                <div key={c.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{kindLabel(c.kind)}</span>
                        {c.is_onboarding && <Badge variant="outline" className="text-[9px]">Onboarding</Badge>}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">{resellers[c.reseller_id] ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{c.description ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-primary">{brl(c.amount_cents)}</p>
                      <div className="mt-1">{statusBadge(c.status)}</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Venc: {formatDate(c.due_date)}</span>
                    {c.paid_at && <span>Pago: {new Date(c.paid_at).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const colorMap: Record<string, { text: string; bg: string; ring: string }> = {
  violet: { text: "text-violet-400", bg: "bg-violet-500/10", ring: "ring-violet-500/25" },
  emerald: { text: "text-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-500/25" },
  amber: { text: "text-amber-500", bg: "bg-amber-500/10", ring: "ring-amber-500/25" },
  rose: { text: "text-rose-500", bg: "bg-rose-500/10", ring: "ring-rose-500/25" },
};

function Kpi({ label, value, hint, color, icon: Icon }: { label: string; value: string; hint?: string; color: keyof typeof colorMap; icon: any }) {
  const c = colorMap[color];
  return (
    <div className={cn("rounded-2xl border border-border bg-card/60 p-4 ring-1", c.ring)}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", c.text)} /> {label}
      </div>
      <div className={cn("mt-2 font-display font-black tabular-nums text-[clamp(1.1rem,2.4vw,1.6rem)]", c.text)}>
        {value}
      </div>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}