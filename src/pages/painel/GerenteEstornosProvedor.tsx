import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Search,
  ArrowRight, Undo2, AlertTriangle, ChevronDown, ChevronUp, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Purchase = {
  id: string;
  reseller_id: string;
  credits: number;
  price_cents: number;
  status: string;
  tipo_entrega: string | null;
  provider_pedido_id: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  provider_response: any;
  resellers?: { display_name: string | null } | null;
};

type RefundReq = {
  reference_id: string;
  amount_cents: number;
  created_at: string;
};

const STATUSES_TO_SHOW = ["cancelado", "cancelled", "canceled", "falha", "failed", "reembolsado"];

const fmtBRL = (c: number) =>
  (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

export default function GerenteEstornosProvedor() {
  const [rows, setRows] = useState<Purchase[]>([]);
  const [refundMap, setRefundMap] = useState<Map<string, RefundReq>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pendente_provedor" | "ok_provedor" | "falhou_provedor">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    // Antes de carregar, pede ao backend que sincronize todos pedidos em aberto
    // (pega pedidos que ficaram travados como "configurando/aguardando" mas já
    // foram cancelados/invalidados no provedor, para aparecerem aqui).
    try {
      const { data: openRows } = await supabase
        .from("reseller_credit_purchases")
        .select("id")
        .in("status", [
          "aguardando", "processando", "pendente",
          "configurando", "recarregando", "entregando",
        ])
        .limit(50);
      const ids = (openRows ?? []).map((r: any) => r.id);
      if (ids.length > 0) {
        await supabase.functions.invoke("sync-credit-purchase-status", {
          body: { purchase_ids: ids },
        });
      }
    } catch { /* silencioso */ }

    const { data, error } = await supabase
      .from("reseller_credit_purchases")
      .select(
        "id,reseller_id,credits,price_cents,status,tipo_entrega,provider_pedido_id,created_at,updated_at,error_message,provider_response,resellers:reseller_id(display_name)"
      )
      .in("status", STATUSES_TO_SHOW)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as any as Purchase[];
    setRows(list);

    // Carrega refunds para esses ids
    const ids = list.map((r) => r.id);
    if (ids.length > 0) {
      const { data: refs } = await supabase
        .from("refund_requests")
        .select("reference_id, amount_cents, created_at")
        .eq("kind", "credit_purchase")
        .in("reference_id", ids);
      const map = new Map<string, RefundReq>();
      (refs ?? []).forEach((r: any) => map.set(r.reference_id, r));
      setRefundMap(map);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();

    // Realtime: qualquer update em reseller_credit_purchases recarrega
    const ch = supabase
      .channel("gerente-estornos-provedor")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reseller_credit_purchases" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "refund_requests" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const retry = async (purchaseId: string, force = false) => {
    setRetrying(purchaseId);
    try {
      const { data, error } = await supabase.functions.invoke("retry-provider-refund", {
        body: { purchase_id: purchaseId, force },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? error?.message ?? "Falha");
        setExpanded(purchaseId);
      } else if ((data as any)?.ok) {
        toast.success("Estorno solicitado no provedor com sucesso");
      } else {
        toast.warning("Provedor recusou o estorno — abrindo detalhes abaixo");
        setExpanded(purchaseId);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setRetrying(null);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const resp = r.provider_response ?? {};
      const hasReq = !!resp.provider_refund_requested_at;
      const ok = !!resp.provider_refund_ok;
      if (filter === "pendente_provedor" && hasReq && ok) return false;
      if (filter === "pendente_provedor" && hasReq && !ok) return false;
      if (filter === "pendente_provedor" && !hasReq) {
        // mantém
      }
      if (filter === "ok_provedor" && !(hasReq && ok)) return false;
      if (filter === "falhou_provedor" && !(hasReq && !ok)) return false;

      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        r.id.toLowerCase().includes(s) ||
        (r.provider_pedido_id ?? "").toLowerCase().includes(s) ||
        (r.resellers?.display_name ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, filter]);

  const counts = useMemo(() => {
    let total = rows.length;
    let pend = 0, ok = 0, fail = 0;
    let openCents = 0;
    rows.forEach((r) => {
      const resp = r.provider_response ?? {};
      const hasReq = !!resp.provider_refund_requested_at;
      const isOk = !!resp.provider_refund_ok;
      const isManual = String(r.status ?? "").startsWith("manual_") || !r.provider_pedido_id;
      if (!hasReq) pend++;
      else if (isOk) ok++;
      else fail++;
      // "Aberto no provedor" = pedidos cancelados/falha com provedor que ainda
      // não retornaram OK no estorno (não solicitados ou que falharam).
      if (!isManual && !(hasReq && isOk)) {
        openCents += Number(r.price_cents || 0);
      }
    });
    return { total, pend, ok, fail, openCents };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="Pedidos cancelados/falha" value={counts.total} cls="bg-zinc-500/10 text-zinc-600 border-zinc-500/30" />
        <Kpi
          label="Aberto p/ estornar (provedor)"
          value={fmtBRL(counts.openCents)}
          cls="bg-orange-500/10 text-orange-600 border-orange-500/30"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={() => setFilter("pendente_provedor")}
        />
        <Kpi
          label="Sem estorno no provedor"
          value={counts.pend}
          cls="bg-amber-500/10 text-amber-600 border-amber-500/30"
          icon={<Clock className="h-3.5 w-3.5" />}
          onClick={() => setFilter("pendente_provedor")}
        />
        <Kpi
          label="Estornado no provedor"
          value={counts.ok}
          cls="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          onClick={() => setFilter("ok_provedor")}
        />
        <Kpi
          label="Falha no provedor"
          value={counts.fail}
          cls="bg-rose-500/10 text-rose-600 border-rose-500/30"
          icon={<XCircle className="h-3.5 w-3.5" />}
          onClick={() => setFilter("falhou_provedor")}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, ID do provedor ou revendedor..."
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "pendente_provedor", "falhou_provedor", "ok_provedor"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-9 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todos" : f === "pendente_provedor" ? "Pendentes" : f === "ok_provedor" ? "OK" : "Falhou"}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} className="h-9">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Nenhum pedido encontrado nesse filtro.
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PurchaseCard
              key={p.id}
              p={p}
              refund={refundMap.get(p.id) ?? null}
              expanded={expanded === p.id}
              onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
              onRetry={(force) => retry(p.id, force)}
              retrying={retrying === p.id}
              copy={copy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label, value, cls, icon, onClick,
}: { label: string; value: number | string; cls: string; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-3 transition hover:scale-[1.01]",
        cls,
      )}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-80 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </button>
  );
}

function StepRow({
  state, title, subtitle, ts,
}: {
  state: "ok" | "fail" | "pending" | "skip";
  title: string;
  subtitle?: React.ReactNode;
  ts?: string | null;
}) {
  const icon = state === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : state === "fail" ? <XCircle className="h-4 w-4 text-rose-500" />
    : state === "pending" ? <Clock className="h-4 w-4 text-amber-500" />
    : <div className="h-4 w-4 rounded-full border-2 border-dashed border-muted-foreground/40" />;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {ts && <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{fmtDate(ts)}</div>}
    </div>
  );
}

function PurchaseCard({
  p, refund, expanded, onToggle, onRetry, retrying, copy,
}: {
  p: Purchase;
  refund: RefundReq | null;
  expanded: boolean;
  onToggle: () => void;
  onRetry: (force: boolean) => void;
  retrying: boolean;
  copy: (s: string) => void;
}) {
  const resp = p.provider_response ?? {};
  const cancelled = ["cancelado", "cancelled", "canceled", "falha", "failed", "reembolsado"].includes(String(p.status));
  const providerRequested = !!resp.provider_refund_requested_at;
  const providerOk = !!resp.provider_refund_ok;
  const providerStatus = resp.provider_refund_status_code as number | undefined;
  const providerError = resp.provider_refund_error as string | null | undefined;
  const providerResp = resp.provider_refund_response;
  const attempts = Array.isArray(resp.provider_refund_attempts) ? resp.provider_refund_attempts : [];
  const isManual = String(p.status ?? "").startsWith("manual_") || !p.provider_pedido_id;

  let providerState: "ok" | "fail" | "pending" | "skip" = "pending";
  if (isManual) providerState = "skip";
  else if (providerRequested && providerOk) providerState = "ok";
  else if (providerRequested && !providerOk) providerState = "fail";

  const resellerState: "ok" | "pending" = refund ? "ok" : "pending";

  return (
    <Card className="overflow-hidden">
      {/* Cabeçalho */}
      <div className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); copy(p.id); }}
              title="Copiar ID completo para pesquisar na aba Acompanhar"
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5 border border-dashed border-border hover:border-primary/50 transition"
            >
              #{p.id.slice(0, 8)}
              <Copy className="h-3 w-3" />
            </button>
            <Badge variant="outline" className="text-[10px] uppercase">
              {p.status}
            </Badge>
            {p.resellers?.display_name && (
              <span className="text-xs text-muted-foreground">· {p.resellers.display_name}</span>
            )}
          </div>
          <div className="text-sm mt-1">
            <span className="font-medium">{p.credits} créditos</span>
            <span className="text-muted-foreground"> · {fmtBRL(p.price_cents)}</span>
            <span className="text-muted-foreground"> · {fmtDate(p.created_at)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
              Pesquisar na aba Acompanhar:
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); copy(p.id); }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] hover:border-primary/50 hover:text-foreground transition"
              title="Copiar ID local"
            >
              <span className="text-muted-foreground">ID:</span>
              <span className="truncate max-w-[180px]">{p.id}</span>
              <Copy className="h-3 w-3" />
            </button>
            {p.provider_pedido_id && (
              <button
                onClick={(e) => { e.stopPropagation(); copy(p.provider_pedido_id!); }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] hover:border-primary/50 hover:text-foreground transition"
                title="Copiar ID do provedor"
              >
                <span className="text-muted-foreground">Provedor:</span>
                <span className="truncate max-w-[180px]">{p.provider_pedido_id}</span>
                <Copy className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip state={providerState} label="Provedor" />
          <StatusChip state={resellerState === "ok" ? "ok" : "pending"} label="Revendedor" />
          {providerState !== "ok" && !isManual && (
            <Badge className="bg-orange-500/15 text-orange-600 border border-orange-500/30 text-[11px]">
              Aberto: {fmtBRL(p.price_cents)}
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onToggle}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-4 space-y-4">
          {/* IDs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <IdField label="ID local" value={p.id} onCopy={() => copy(p.id)} />
            <IdField
              label="ID provedor"
              value={p.provider_pedido_id ?? "—"}
              onCopy={p.provider_pedido_id ? () => copy(p.provider_pedido_id!) : undefined}
            />
          </div>

          {/* Timeline */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Linha do tempo
            </div>

            <StepRow
              state={cancelled ? "ok" : "pending"}
              title="1. Pedido cancelado / falhou"
              subtitle={p.error_message ? `Motivo: ${p.error_message}` : `Status: ${p.status}`}
              ts={p.updated_at ?? p.created_at}
            />

            {isManual ? (
              <StepRow
                state="skip"
                title="2. Estorno no provedor da Lojinha"
                subtitle="Pedido manual / sem provedor — não se aplica"
              />
            ) : (
              <StepRow
                state={providerState as any}
                title="2. Estorno no provedor da Lojinha"
                subtitle={
                  !providerRequested
                    ? "Ainda não solicitado. Use o botão abaixo para tentar agora."
                    : (
                      <span>
                        HTTP <span className="font-mono">{providerStatus ?? "—"}</span>
                        {providerOk ? " · OK" : " · Falhou"}
                        {providerError && <span className="text-rose-500"> · {providerError}</span>}
                      </span>
                    )
                }
                ts={resp.provider_refund_last_attempt_at ?? resp.provider_refund_requested_at}
              />
            )}

            <StepRow
              state={resellerState as any}
              title="3. Estorno para o revendedor (saldo no painel)"
              subtitle={
                refund
                  ? `Creditado ${fmtBRL(refund.amount_cents)} no saldo`
                  : "Aguardando o revendedor clicar em 'Solicitar estorno'"
              }
              ts={refund?.created_at}
            />
          </div>

          {/* Ações */}
          {!isManual && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {providerState !== "ok" && (
                <Button
                  size="sm"
                  onClick={() => onRetry(false)}
                  disabled={retrying}
                >
                  {retrying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
                  {providerRequested ? "Tentar novamente no provedor" : "Solicitar estorno no provedor agora"}
                </Button>
              )}
              {providerState === "ok" && (
                <Button size="sm" variant="outline" onClick={() => onRetry(true)} disabled={retrying}>
                  {retrying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  Forçar reenvio
                </Button>
              )}
            </div>
          )}

          {/* Tentativas */}
          {attempts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Tentativas manuais ({attempts.length})
              </div>
              <div className="space-y-1.5">
                {attempts.slice().reverse().map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs rounded-md border border-border bg-background/50 p-2">
                    {a.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                    <span className="font-mono text-[11px]">{fmtDate(a.at)}</span>
                    <span className="text-muted-foreground">HTTP {a.status_code ?? "—"}</span>
                    {a.error && <span className="text-rose-500 truncate">· {a.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resposta bruta do provedor */}
          {providerResp && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Resposta bruta do provedor
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-border bg-background/50 p-3 font-mono text-[11px]">
{JSON.stringify(providerResp, null, 2)}
              </pre>
            </details>
          )}

          {!cancelled && (
            <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Este pedido ainda não está cancelado — o estorno no provedor só deve ser feito após o cancelamento.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusChip({ state, label }: { state: "ok" | "fail" | "pending" | "skip"; label: string }) {
  const map = {
    ok: { cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    fail: { cls: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: <XCircle className="h-3 w-3" /> },
    pending: { cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
    skip: { cls: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30", icon: <ArrowRight className="h-3 w-3" /> },
  } as const;
  const v = map[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", v.cls)}>
      {v.icon} {label}
    </span>
  );
}

function IdField({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">{label}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <code className="font-mono text-[11px] truncate">{value}</code>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}