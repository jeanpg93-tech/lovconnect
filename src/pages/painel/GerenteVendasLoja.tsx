import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatCard } from "@/components/painel/PageHeader";
import {
  ShoppingBag, Search, CheckCircle2, Clock, XCircle, Loader2,
  TrendingUp, Banknote, Calendar, Copy, ChevronDown, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type Row = {
  id: string;
  reseller_id: string;
  extension_id: string | null;
  license_type: string;
  buyer_name: string;
  buyer_whatsapp: string;
  price_cents: number;
  status: string;
  provider: string | null;
  provider_transaction_id: string | null;
  license_key: string | null;
  error_message: string | null;
  paid_at: string | null;
  created_at: string;
  raw_response: any;
};

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: "Concluída", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  paid:      { label: "Pago",      color: "bg-sky-500/15 text-sky-400",         icon: CheckCircle2 },
  pending:   { label: "Pendente",  color: "bg-amber-500/15 text-amber-400",     icon: Clock },
  awaiting_balance: { label: "Aguardando saldo", color: "bg-amber-500/15 text-amber-500", icon: Clock },
  failed:    { label: "Falha",     color: "bg-destructive/15 text-destructive", icon: XCircle },
};

const fmtBRL = (c: number) =>
  (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PERIODS = [
  { id: "all",   label: "Tudo" },
  { id: "today", label: "Hoje" },
  { id: "week",  label: "7 dias" },
  { id: "month", label: "Mês" },
] as const;
type Period = typeof PERIODS[number]["id"];

export default function GerenteVendasLoja() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [resellers, setResellers] = useState<Record<string, string>>({});
  const [extensions, setExtensions] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<Period>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("storefront_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (period !== "all") {
        const now = new Date();
        let from: Date | null = null;
        if (period === "today") from = new Date(now.setHours(0, 0, 0, 0));
        if (period === "week") { const d = new Date(); d.setDate(d.getDate() - 7); from = d; }
        if (period === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
        if (from) query = query.gte("created_at", from.toISOString());
      }
      if (statusF !== "all") query = query.eq("status", statusF);

      const { data, error } = await query;
      if (error) throw error;

      const list = (data ?? []) as Row[];
      setRows(list);

      const rIds = Array.from(new Set(list.map(r => r.reseller_id).filter(Boolean)));
      const eIds = Array.from(new Set(list.map(r => r.extension_id).filter(Boolean) as string[]));

      const [{ data: rs }, { data: es }] = await Promise.all([
        rIds.length
          ? supabase.from("resellers").select("id,display_name,slug").in("id", rIds)
          : Promise.resolve({ data: [] as any[] }),
        eIds.length
          ? supabase.from("extensions").select("id,name").in("id", eIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const rmap: Record<string, string> = {};
      (rs ?? []).forEach((x: any) => { rmap[x.id] = x.display_name || x.slug || x.id.slice(0, 8); });
      setResellers(rmap);
      const emap: Record<string, string> = {};
      (es ?? []).forEach((x: any) => { emap[x.id] = x.name; });
      setExtensions(emap);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar vendas da loja");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, statusF]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.buyer_name, r.buyer_whatsapp, r.license_type, r.license_key, r.provider_transaction_id,
       resellers[r.reseller_id], r.extension_id ? extensions[r.extension_id] : ""]
        .filter(Boolean).join(" ").toLowerCase().includes(term)
    );
  }, [rows, q, resellers, extensions]);

  const stats = useMemo(() => {
    const paid = filtered.filter(r => r.status === "paid" || r.status === "completed");
    const totalCents = paid.reduce((s, r) => s + Number(r.price_cents || 0), 0);
    return {
      total: filtered.length,
      paidCount: paid.length,
      totalCents,
      pending: filtered.filter(r => r.status === "pending").length,
      failed: filtered.filter(r => r.status === "failed").length,
    };
  }, [filtered]);

  const copy = (s: string | null) => {
    if (!s) return;
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Vendas da Loja"
        description="Histórico completo de vendas, transações e logs originados pelas lojas dos revendedores."
        icon={ShoppingBag}
      />

      {/* Filtros de período */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                period === p.id
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar comprador, revendedor, chave..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Vendas" value={stats.total} icon={ShoppingBag} hint="No período" />
        <StatCard label="Pagas" value={stats.paidCount} icon={CheckCircle2} hint={`${stats.pending} pendentes`} />
        <StatCard label="Falharam" value={stats.failed} icon={XCircle} hint="Provedor / pagamento" />
        <StatCard label="Receita" value={fmtBRL(stats.totalCents)} icon={Banknote} hint="Apenas vendas pagas" />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "pending", "awaiting_balance", "paid", "completed", "failed"].map((s) => (
          <Button
            key={s}
            variant={statusF === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusF(s)}
            className="h-8 text-[9px] font-bold uppercase tracking-widest"
          >
            {s === "all" ? "Todos" : statusMap[s]?.label ?? s}
          </Button>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-3xl border border-border bg-card p-3 sm:p-4 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground italic">
            Nenhuma venda encontrada.
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((r) => {
              const st = statusMap[r.status] ?? { label: r.status, color: "bg-muted text-muted-foreground", icon: Clock };
              const isOpen = openId === r.id;
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all overflow-hidden">
                  <button
                    onClick={() => setOpenId(isOpen ? null : r.id)}
                    className="w-full text-left p-4 flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground mt-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm truncate">{r.buyer_name}</span>
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", st.color)}>
                            <st.icon className="h-3 w-3" />{st.label}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{r.license_type}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>📞 {r.buyer_whatsapp}</span>
                          <span>🏪 {resellers[r.reseller_id] ?? r.reseller_id.slice(0, 8)}</span>
                          {r.extension_id && <span>📦 {extensions[r.extension_id] ?? r.extension_id.slice(0, 8)}</span>}
                          <span className="font-mono">{format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-sm text-primary">{fmtBRL(r.price_cents)}</div>
                      {r.paid_at && (
                        <div className="text-[9px] text-muted-foreground font-mono mt-0.5">
                          pago {format(new Date(r.paid_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-11 space-y-3 border-t border-white/5 bg-black/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-3">
                        <KV label="Order ID" value={r.id} mono onCopy={() => copy(r.id)} />
                        <KV label="Provider TX" value={r.provider_transaction_id ?? "—"} mono onCopy={() => copy(r.provider_transaction_id)} />
                        <KV label="Provider" value={r.provider ?? "—"} />
                        <KV label="Status" value={r.status} />
                        <KV label="Licença gerada" value={r.license_key ?? "—"} mono onCopy={() => copy(r.license_key)} />
                        {r.error_message && <KV label="Erro" value={r.error_message} className="text-destructive md:col-span-2" />}
                      </div>
                      {r.raw_response && (
                        <div>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1">Webhook payload</div>
                          <pre className="text-[10px] font-mono bg-black/40 border border-white/5 rounded-lg p-3 overflow-auto max-h-64">
{JSON.stringify(r.raw_response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function KV({ label, value, mono, onCopy, className }: {
  label: string; value: string; mono?: boolean; onCopy?: () => void; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2", className)}>
      <div className="min-w-0">
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
        <div className={cn("text-xs break-all", mono && "font-mono")}>{value}</div>
      </div>
      {onCopy && value !== "—" && (
        <button onClick={onCopy} className="shrink-0 p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
