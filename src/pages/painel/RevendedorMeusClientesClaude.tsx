import { useEffect, useState } from "react";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, RefreshCw, Mail, User, AlertCircle, Activity, Copy, KeyRound, Ban, ShieldAlert, Store, Code2, Phone, Hash } from "lucide-react";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import ApiKeyReveal from "@/components/painel/ApiKeyReveal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Order = {
  id: string;
  plan_code: string;
  status: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  customer_identifier?: string | null;
  origin?: 'loja' | 'api';
  created_at: string;
  sale_price_cents: number;
  provider_key_id: string | null;
  code: string | null;
  provider_api_key: string | null;
  provider_status?: string | null;
  refund_deadline_at?: string | null;
  within_refund_window?: boolean;
  cancel_requested_at?: string | null;
  cancel_request_note?: string | null;
  refund_waived?: boolean;
  customer_refund_full_name?: string | null;
  customer_refund_pix_key?: string | null;
  customer_refund_pix_key_type?: string | null;
  customer_refunded_at?: string | null;
  customer_refund_note?: string | null;
  usage: null | {
    email: string;
    status?: string;
    accountExpiresAt?: string;
    redeemedAt?: string;
    tokensConsumed?: number;
    tokenLimit?: number;
    tokensInWindow?: number;
    tokenWindowHours?: number;
    dailyPercentUsed?: number;
    weeklyTokenLimit?: number;
    weeklyTokensInWindow?: number;
    percentRemaining?: number;
  };
};

const PLAN_LABELS: Record<string, string> = {
  "pro_30d": "Pro · 30 dias",
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  issued: { label: "Entregue", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
  redeemed: { label: "Ativada", className: "border-sky-500/40 bg-sky-500/10 text-sky-500" },
  cancel_requested: { label: "Cancelamento solicitado", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  cancel_rejected: { label: "Cancelamento negado", className: "border-rose-500/40 bg-rose-500/10 text-rose-500" },
  pending: { label: "Pendente", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  awaiting_balance: { label: "Aguardando saldo", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  awaiting_payment: { label: "Aguardando pagamento", className: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  paid: { label: "Pago", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
  cancelled: { label: "Cancelado", className: "border-rose-500/40 bg-rose-500/10 text-rose-500" },
  expired: { label: "Expirado", className: "border-rose-500/40 bg-rose-500/10 text-rose-500" },
  failed: { label: "Falhou", className: "border-rose-500/40 bg-rose-500/10 text-rose-500" },
  refunded: { label: "Reembolsado", className: "border-muted-foreground/40 bg-muted/40 text-muted-foreground" },
};

const fmtTokens = (n?: number | null) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")} Mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} Mil`;
  return String(n);
};

export default function RevendedorMeusClientesClaude() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmRefundTarget, setConfirmRefundTarget] = useState<Order | null>(null);
  const [confirmingRefund, setConfirmingRefund] = useState(false);

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    const { data, error } = await invokeAuthenticatedFunction<any>("claude-customers-usage", { method: "GET" });
    if (!error && data?.orders) {
      setOrders(data.orders);
      setProviderError(data.provider_error ?? null);
    } else if ((data as any)?.error) {
      setProviderError((data as any).error);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const doCancel = async (force: boolean) => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { data, error } = await invokeAuthenticatedFunction<any>("claude-cancel-key", {
        method: "POST",
        body: { order_id: cancelTarget.id, force },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.message ?? (data as any)?.error ?? "Falha ao cancelar");
      } else {
        toast.success(
          data?.refund_waived
            ? "Chave cancelada — sem estorno (fora dos 7 dias)."
            : `Chave cancelada e estorno de R$ ${((data?.refund_cents ?? 0) / 100).toFixed(2)} devolvido à carteira.`,
        );
        setCancelTarget(null);
        load(true);
      }
    } finally {
      setCancelling(false);
    }
  };

  const doConfirmRefund = async () => {
    if (!confirmRefundTarget) return;
    setConfirmingRefund(true);
    try {
      const { data, error } = await invokeAuthenticatedFunction<any>("claude-confirm-customer-refund", {
        method: "POST",
        body: { order_id: confirmRefundTarget.id },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.message ?? (data as any)?.error ?? "Falha ao confirmar estorno");
      } else {
        toast.success("Estorno confirmado. O cliente foi notificado.");
        setConfirmRefundTarget(null);
        load(true);
      }
    } finally {
      setConfirmingRefund(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(() => load(true), 60_000);
    return () => clearInterval(i);
  }, []);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      (o.customer_email ?? "").toLowerCase().includes(q) ||
      (o.customer_whatsapp ?? "").toLowerCase().includes(q) ||
      (PLAN_LABELS[o.plan_code] ?? o.plan_code).toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight">Meus Clientes Claude</h1>
          <p className="text-xs text-muted-foreground mt-1">Consumo de tokens em tempo real do fornecedor (atualiza a cada 60s).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {providerError && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Não foi possível ler o consumo no fornecedor agora ({providerError}). Os dados das vendas continuam exibidos.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail, WhatsApp ou plano…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nenhuma venda Claude encontrada.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((o) => {
            const pct = o.usage?.tokenLimit
              ? Math.min(100, Math.round(((o.usage.tokensInWindow ?? 0) * 100) / o.usage.tokenLimit))
              : null;
            const noEmail = !o.customer_email;
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ClaudeIcon className="h-4 w-4 text-primary" />
                      <span className="font-display text-sm font-semibold">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</span>
                      {o.origin === 'api' ? (
                        <Badge variant="outline" className="text-[9px] font-bold uppercase border-violet-500/40 bg-violet-500/10 text-violet-400">
                          <Code2 className="mr-0.5 h-2.5 w-2.5" /> API
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] font-bold uppercase border-sky-500/40 bg-sky-500/10 text-sky-400">
                          <Store className="mr-0.5 h-2.5 w-2.5" /> Loja
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[12px] text-foreground/80 truncate">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">{o.customer_name ?? "Sem nome"}</span>
                    </div>
                    {o.customer_email && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{o.customer_email}</span>
                      </div>
                    )}
                    {o.customer_whatsapp && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{o.customer_whatsapp}</span>
                      </div>
                    )}
                    {!o.customer_email && !o.customer_name && o.customer_identifier && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Hash className="h-3 w-3" />
                        <span className="truncate font-mono">id_cliente: {o.customer_identifier}</span>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const meta = STATUS_META[o.status] ?? { label: o.status, className: "border-border bg-muted/40 text-foreground" };
                    return (
                      <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", meta.className)}>
                        {meta.label}
                      </Badge>
                    );
                  })()}
                </div>

                {o.cancel_requested_at && !["cancelled", "refunded"].includes(o.status) && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-600">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Cliente solicitou cancelamento</div>
                      <div>Em {new Date(o.cancel_requested_at).toLocaleString("pt-BR")}{o.within_refund_window ? " — dentro dos 7 dias (estorno automático)." : " — fora do prazo (sem estorno)."}</div>
                      {o.cancel_request_note && <div className="mt-0.5 italic opacity-80">"{o.cancel_request_note}"</div>}
                    </div>
                  </div>
                )}

                {o.customer_refund_pix_key && !o.customer_refunded_at && (
                  <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 text-[11px] text-sky-700 dark:text-sky-300">
                    <div className="font-semibold flex items-center gap-1"><Copy className="h-3 w-3" /> PIX para estorno do cliente</div>
                    <div className="mt-1 grid gap-0.5">
                      <div>Nome: <b>{o.customer_refund_full_name ?? "—"}</b></div>
                      <div>Tipo: <b className="uppercase">{o.customer_refund_pix_key_type ?? "—"}</b></div>
                      <div className="flex items-center gap-1">
                        Chave: <code className="font-mono truncate">{o.customer_refund_pix_key}</code>
                        <Button
                          variant="ghost" size="sm" className="h-5 px-1"
                          onClick={() => { navigator.clipboard.writeText(o.customer_refund_pix_key!); toast.success("Chave PIX copiada"); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {o.customer_refunded_at && (
                  <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    ✅ Estorno ao cliente confirmado em {new Date(o.customer_refunded_at).toLocaleString("pt-BR")}.
                  </div>
                )}

                {o.provider_api_key ? (
                  <div className="mt-2">
                    <ApiKeyReveal value={o.provider_api_key} />
                  </div>
                ) : o.code ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary shrink-0" />
                    <code className="flex-1 truncate font-mono text-[11px] text-foreground/90">{o.code}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => {
                        navigator.clipboard.writeText(o.code!);
                        toast.success("Código copiado");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null}

                {noEmail ? (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                    Sem e-mail cadastrado — não é possível ligar ao consumo do fornecedor. Cadastre o e-mail nas próximas emissões.
                  </div>
                ) : o.usage ? (
                  <div className="mt-3 space-y-2">
                    {/* Janela diária */}
                    {(() => {
                      const daily = o.usage.dailyPercentUsed != null
                        ? Math.min(100, Math.round(o.usage.dailyPercentUsed))
                        : pct;
                      return (
                        <div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Activity className="h-3 w-3" /> Janela {o.usage.tokenWindowHours ?? 12}h
                            </span>
                            <span className="font-semibold">
                              {fmtTokens(o.usage.tokensInWindow)} / {fmtTokens(o.usage.tokenLimit)}
                              {daily != null && <span className="ml-1 text-muted-foreground">({daily}%)</span>}
                            </span>
                          </div>
                          {daily != null && (
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  daily >= 90 ? "bg-rose-500" : daily >= 70 ? "bg-amber-500" : "bg-emerald-500",
                                )}
                                style={{ width: `${daily}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Janela semanal */}
                    {o.usage.weeklyTokenLimit ? (() => {
                      const used = o.usage.weeklyTokensInWindow ?? 0;
                      const lim = o.usage.weeklyTokenLimit ?? 1;
                      const wpct = Math.min(100, Math.round((used * 100) / lim));
                      return (
                        <div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Semana</span>
                            <span className="font-semibold">
                              {fmtTokens(used)} / {fmtTokens(lim)} <span className="text-muted-foreground">({wpct}%)</span>
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                            <div
                              className={cn(
                                "h-full transition-all",
                                wpct >= 90 ? "bg-rose-500" : wpct >= 70 ? "bg-amber-500" : "bg-sky-500",
                              )}
                              style={{ width: `${wpct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })() : null}

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                      <div>Total consumido: <span className="font-semibold text-foreground">{fmtTokens(o.usage.tokensConsumed)}</span></div>
                      {o.usage.redeemedAt && (
                        <div>Resgatada: <span className="font-semibold text-foreground">{new Date(o.usage.redeemedAt).toLocaleString("pt-BR")}</span></div>
                      )}
                      {o.usage.accountExpiresAt && (
                        <div className="col-span-2">Expira: <span className="font-semibold text-foreground">{new Date(o.usage.accountExpiresAt).toLocaleString("pt-BR")}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                    Cliente ainda não resgatou ou e-mail não encontrado no fornecedor.
                  </div>
                )}

                {["issued", "redeemed", "cancel_requested"].includes(o.status) && (
                  <div className="mt-3 flex justify-stretch sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full sm:w-auto border-rose-500/40 text-rose-500 hover:bg-rose-500/10"
                      onClick={() => setCancelTarget(o)}
                    >
                      <Ban className="mr-1 h-3 w-3" /> Cancelar / Revogar chave
                    </Button>
                  </div>
                )}

                {o.status === "cancelled" && o.customer_refund_pix_key && !o.customer_refunded_at && (
                  <div className="mt-2 flex justify-stretch sm:justify-end">
                    <Button
                      size="sm"
                      className="h-8 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setConfirmRefundTarget(o)}
                    >
                      ✓ Confirmar estorno enviado
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar chave Claude</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Cliente: <b>{cancelTarget?.customer_name ?? "—"}</b> ({cancelTarget?.customer_email ?? "—"})
                </div>
                <div>Plano: <b>{PLAN_LABELS[cancelTarget?.plan_code ?? ""] ?? cancelTarget?.plan_code}</b></div>
                {cancelTarget?.within_refund_window ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-emerald-600">
                    ✅ Dentro dos 7 dias — o valor debitado será <b>estornado automaticamente</b> na carteira.
                  </div>
                ) : (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-rose-500">
                    ⚠️ Fora do prazo de 7 dias — o cancelamento pode ser feito mesmo assim, mas <b>NÃO haverá estorno</b>.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel disabled={cancelling} className="mt-0 w-full sm:w-auto">Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700"
              onClick={(e) => { e.preventDefault(); doCancel(!cancelTarget?.within_refund_window); }}
            >
              {cancelling ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
              {cancelTarget?.within_refund_window ? "Cancelar com estorno" : "Cancelar sem estorno"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRefundTarget} onOpenChange={(o) => !o && setConfirmRefundTarget(null)}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar estorno enviado ao cliente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>Confirme que você já enviou o PIX de estorno para o cliente abaixo. O cliente será notificado no portal.</div>
                {confirmRefundTarget?.customer_refund_pix_key && (
                  <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs">
                    <div>Nome: <b>{confirmRefundTarget?.customer_refund_full_name ?? "—"}</b></div>
                    <div>Chave ({confirmRefundTarget?.customer_refund_pix_key_type}): <code className="font-mono">{confirmRefundTarget?.customer_refund_pix_key}</code></div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">Esta ação não movimenta seu saldo — é apenas o registro da confirmação manual do PIX enviado ao cliente.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel disabled={confirmingRefund} className="mt-0 w-full sm:w-auto">Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmingRefund}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              onClick={(e) => { e.preventDefault(); doConfirmRefund(); }}
            >
              {confirmingRefund ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Confirmar estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}