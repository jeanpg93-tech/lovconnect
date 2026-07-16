import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ApiKeyReveal from "@/components/painel/ApiKeyReveal";
import {
  Copy, Check, RefreshCw, Search, Loader2, Store, User, KeyRound,
  ChevronDown, ChevronRight, Activity, Mail, Phone, Calendar, Zap, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { cn } from "@/lib/utils";

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

type UsageInfo = {
  email?: string;
  status?: string | null;
  tokensConsumed?: number | null;
  tokenLimit?: number | null;
  tokensInWindow?: number | null;
  tokenWindowHours?: number | null;
  percentRemaining?: number | null;
  weeklyTokensInWindow?: number | null;
  weeklyTokenLimit?: number | null;
  accountExpiresAt?: string | null;
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

const fmtTokens = (n: number | null | undefined) => {
  if (n == null || !isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [usageByOrderId, setUsageByOrderId] = useState<Record<string, UsageInfo>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);

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

  const loadUsage = async () => {
    setUsageLoading(true);
    const { data, error } = await invokeAuthenticatedFunction<any>(
      "manager-claude-provider-users",
      { method: "POST", body: { scope: "all" } },
    );
    setUsageLoading(false);
    if (error) {
      toast.error("Falha ao carregar consumo do provedor");
      return;
    }
    setUsageByOrderId((data?.usage_by_order_id ?? {}) as Record<string, UsageInfo>);
    setUsageLoaded(true);
  };

  useEffect(() => {
    load();
    loadUsage();
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        <Button variant="outline" onClick={() => { load(); loadUsage(); }} disabled={refreshing || usageLoading}>
          {(refreshing || usageLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

      {loading ? (
        <div className="rounded-lg border bg-card flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
          Nenhuma licença encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const rname = o.is_manager_manual
              ? "Gerente (manual)"
              : (o.reseller_id ? (resellerNames[o.reseller_id] ?? "—") : "—");
            const isOpen = expanded.has(o.id);
            const usage = usageByOrderId[o.id];
            return (
              <div
                key={o.id}
                className={cn(
                  "rounded-lg border bg-card transition-colors",
                  isOpen && "ring-1 ring-primary/30",
                )}
              >
                <div className="grid grid-cols-12 gap-3 p-3 items-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(o.id)}
                    className="col-span-12 md:col-span-4 flex items-start gap-2 text-left min-w-0"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{o.customer_name ?? "—"}</span>
                        <Badge variant="outline" className={cn("text-[10px] py-0 h-5", STATUS_STYLES[o.status] ?? "")}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                        {o.is_trial ? (
                          <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-500 text-[10px] py-0 h-5">
                            Trial
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {o.customer_email ?? o.customer_whatsapp ?? "—"}
                      </div>
                    </div>
                  </button>

                  <div className="col-span-6 md:col-span-2 min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground/70">Revendedor</div>
                    <div className="flex items-center gap-1.5 text-sm truncate">
                      <Store className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{rname}</span>
                    </div>
                  </div>

                  <div className="col-span-6 md:col-span-2 min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground/70">Plano</div>
                    <div className="text-sm truncate">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</div>
                  </div>

                  <div className="col-span-6 md:col-span-2 min-w-0 text-right md:text-left">
                    <div className="text-[10px] uppercase text-muted-foreground/70">Venda / Custo</div>
                    <div className="text-sm font-medium">{fmtBRL(o.sale_price_cents)}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtBRL(o.cost_cents)}</div>
                  </div>

                  <div className="col-span-6 md:col-span-2 min-w-0 text-right">
                    <div className="text-[10px] uppercase text-muted-foreground/70">Data</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(o.created_at)}</div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-4 py-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase text-muted-foreground/70 flex items-center gap-1">
                          <KeyRound className="h-3 w-3" /> Código ACT
                        </div>
                        <div className="flex items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5">
                          <code className="flex-1 text-xs font-mono truncate">{o.code}</code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => copy(`code-${o.id}`, o.code)}
                          >
                            {copiedId === `code-${o.id}` ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase text-muted-foreground/70">API Key</div>
                        {o.provider_api_key ? (
                          <ApiKeyReveal value={o.provider_api_key} claudeOrderId={o.id} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3 text-xs">
                      {o.customer_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{o.customer_email}</span>
                        </div>
                      )}
                      {o.customer_whatsapp && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{o.customer_whatsapp}</span>
                        </div>
                      )}
                      {o.redeemed_at && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Resgatada em {fmtDate(o.redeemed_at)}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border bg-background/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Consumo de tokens</span>
                        {usageLoading && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 ml-auto text-[10px]"
                          onClick={loadUsage}
                          disabled={usageLoading}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
                        </Button>
                      </div>
                      {!usageLoaded || usageLoading ? (
                        <div className="text-xs text-muted-foreground">Consultando provedor…</div>
                      ) : !usage ? (
                        <div className="text-xs text-muted-foreground">
                          Sem dados de consumo para esta chave (chave ainda não resgatada, expirada ou removida no provedor).
                        </div>
                      ) : (
                        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                          <UsageStat label="Consumidos" value={fmtTokens(usage.tokensConsumed)} />
                          <UsageStat label="Na janela" value={fmtTokens(usage.tokensInWindow)} suffix={usage.tokenWindowHours ? `/ ${fmtTokens(usage.tokenLimit)} · ${usage.tokenWindowHours}h` : usage.tokenLimit ? `/ ${fmtTokens(usage.tokenLimit)}` : undefined} />
                          <UsageStat label="Semanal" value={fmtTokens(usage.weeklyTokensInWindow)} suffix={usage.weeklyTokenLimit ? `/ ${fmtTokens(usage.weeklyTokenLimit)}` : undefined} />
                          <UsageStat
                            label="Restante"
                            value={usage.percentRemaining != null ? `${Math.round(Number(usage.percentRemaining))}%` : "—"}
                            highlight
                          />
                        </div>
                      )}
                      {usage?.accountExpiresAt && (
                        <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Expira em {fmtDate(usage.accountExpiresAt)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

function UsageStat({ label, value, suffix, highlight }: { label: string; value: string; suffix?: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] uppercase text-muted-foreground/70">{label}</div>
      <div className={cn("text-sm font-semibold", highlight && "text-primary")}>{value}</div>
      {suffix && <div className="text-[10px] text-muted-foreground truncate">{suffix}</div>}
    </div>
  );
}