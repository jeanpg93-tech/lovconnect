import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ApiKeyReveal from "@/components/painel/ApiKeyReveal";
import { Copy, Check, RefreshCw, Search, Loader2, Store, User, KeyRound } from "lucide-react";
import { toast } from "sonner";

type Order = {
  id: string;
  reseller_id: string | null;
  plan_code: string;
  code: string;
  provider_api_key: string | null;
  cost_cents: number | null;
  sale_price_cents: number | null;
  status: string;
  is_trial: boolean | null;
  is_manager_manual: boolean | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  created_at: string;
  cancelled_at: string | null;
  redeemed_at: string | null;
  expired_at: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  pro_30d: "Pro · 30d",
  "5x_30d": "Max 5X · 30d",
  "20x_30d": "Max 20X · 30d",
  api_500k_30d: "API 500K · 30d",
  api_25m_30d: "API 2,5M · 30d",
  api_10m_30d: "API 10M · 30d",
  trial_15m_50msg: "Teste grátis",
};

const STATUS_LABELS: Record<string, string> = {
  issued: "Emitida",
  redeemed: "Resgatada",
  expired: "Expirada",
  cancelled: "Cancelada",
  pending: "Pendente",
};

const STATUS_STYLES: Record<string, string> = {
  issued: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  redeemed: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  expired: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  cancelled: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  pending: "bg-muted text-muted-foreground border-border",
};

const fmtBRL = (c: number | null | undefined) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const norm = (v: unknown) =>
  String(v ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function GerenteClaudeVendas() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [resellerNames, setResellerNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resellerFilter, setResellerFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from("claude_orders")
      .select(
        "id, reseller_id, plan_code, code, provider_api_key, cost_cents, sale_price_cents, status, is_trial, is_manager_manual, customer_name, customer_email, customer_whatsapp, created_at, cancelled_at, redeemed_at, expired_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast.error("Falha ao carregar licenças");
      setRefreshing(false);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as Order[];
    setOrders(rows);
    const ids = Array.from(new Set(rows.map((r) => r.reseller_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: rs } = await supabase
        .from("resellers")
        .select("id, display_name")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const r of (rs ?? []) as any[]) map[r.id] = r.display_name ?? "—";
      setResellerNames(map);
    } else {
      setResellerNames({});
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("gerente-claude-vendas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claude_orders" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resellerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.reseller_id) set.add(o.reseller_id);
    return Array.from(set)
      .map((id) => ({ id, name: resellerNames[id] ?? "—" }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [orders, resellerNames]);

  const filtered = useMemo(() => {
    const q = norm(search).trim();
    const qDigits = q.replace(/\D+/g, "");
    return orders.filter((o) => {
      if (statusFilter !== "all" && (o.status ?? "") !== statusFilter) return false;
      if (resellerFilter !== "all" && (o.reseller_id ?? "") !== resellerFilter) return false;
      if (!q) return true;
      const bag = [
        o.code,
        o.provider_api_key,
        o.customer_name,
        o.customer_email,
        o.customer_whatsapp,
        resellerNames[o.reseller_id ?? ""] ?? "",
        PLAN_LABELS[o.plan_code] ?? o.plan_code,
      ]
        .map(norm)
        .join(" ");
      if (bag.includes(q)) return true;
      if (qDigits && bag.replace(/\D+/g, "").includes(qDigits)) return true;
      return false;
    });
  }, [orders, search, statusFilter, resellerFilter, resellerNames]);

  const totals = useMemo(() => {
    let sale = 0, cost = 0, count = 0, active = 0;
    for (const o of filtered) {
      sale += o.sale_price_cents ?? 0;
      cost += o.cost_cents ?? 0;
      count++;
      if (o.status === "issued" || o.status === "redeemed") active++;
    }
    return { sale, cost, count, active, profit: sale - cost };
  }, [filtered]);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Licenças Claude — Todas as Vendas</h1>
          <p className="text-muted-foreground">
            Visão global de todas as licenças Claude emitidas pelos revendedores e pelo gerente.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Licenças</div>
          <div className="mt-1 text-2xl font-bold">{totals.count}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Ativas / Resgatadas</div>
          <div className="mt-1 text-2xl font-bold">{totals.active}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Receita (venda)</div>
          <div className="mt-1 text-2xl font-bold">{fmtBRL(totals.sale)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Custo total</div>
          <div className="mt-1 text-2xl font-bold">{fmtBRL(totals.cost)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, API key, cliente, revendedor…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="issued">Emitidas</SelectItem>
            <SelectItem value="redeemed">Resgatadas</SelectItem>
            <SelectItem value="expired">Expiradas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resellerFilter} onValueChange={setResellerFilter}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Revendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os revendedores</SelectItem>
            {resellerOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">Nenhuma licença encontrada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Revendedor</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Código ACT</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-right">Custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => {
                const rname = o.is_manager_manual
                  ? "Gerente (manual)"
                  : (o.reseller_id ? (resellerNames[o.reseller_id] ?? "—") : "—");
                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(o.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{rname}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{o.customer_name ?? "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {o.customer_email ?? o.customer_whatsapp ?? ""}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</span>
                        {o.is_trial ? (
                          <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-500">
                            Trial
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[o.status] ?? ""}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                        <code className="text-xs">{o.code}</code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copy(`code-${o.id}`, o.code)}
                        >
                          {copiedId === `code-${o.id}` ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {o.provider_api_key ? (
                        <ApiKeyReveal apiKey={o.provider_api_key} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {fmtBRL(o.sale_price_cents)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                      {fmtBRL(o.cost_cents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </PageContainer>
  );
}