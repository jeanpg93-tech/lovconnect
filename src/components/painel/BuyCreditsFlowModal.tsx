import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Terminal,
  ShieldCheck,
  Package,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  Mail,
  RefreshCw,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  PlusCircle,
  ListChecks,
  Zap,
  Hand,
  Wallet,
  ArrowRight,
  UserPlus,
  Send,
  Rocket,
} from "lucide-react";


type Plan = {
  id: string;
  label: string;
  credits_amount: number;
};

type CreatedOrder = {
  id?: string;
  pedidoId?: string;
  status?: string;
  emailConviteBot?: string;
  workspaceId?: string;
  workspaceName?: string;
  creditosEnviados?: number;
};

const DELIVERY_TYPES = [
  {
    id: "workspace_proprio",
    title: "Workspace Próprio",
    desc: "O bot entra no workspace já existente do cliente via convite.",
    icon: Terminal,
  },
];

const formatBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Step = "review" | "delivery" | "success";

export function BuyCreditsFlowModal({
  open,
  onOpenChange,
  plan,
  costPrice,
  balance,
  onSuccess,
  mode = "automatico",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: Plan | null;
  costPrice: number;
  balance: number;
  onSuccess?: () => void;
  mode?: "automatico" | "manual";
}) {
  const [step, setStep] = useState<Step>("review");
  const [deliveryType, setDeliveryType] = useState("workspace_proprio");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
  const [showError, setShowError] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  // Manual flow sub-steps: "invite" -> "tracking"
  const [manualSubStep, setManualSubStep] = useState<"invite" | "tracking">("invite");
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const MANUAL_BOT_EMAIL = "recargas@revendovable.store";

  const reset = () => {
    setStep("review");
    setDeliveryType("workspace_proprio");
    setLastOrder(null);
    setSubmitting(false);
    setRefreshing(false);
    setAgreed(false);
    setInviteSent(false);
    setManualSubStep("invite");
    setWorkspaceName("");
    setSavingMeta(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      if (submitting) return;
      reset();
    }
    onOpenChange(o);
  };

  const call = async (
    action: string,
    opts?: { method?: "GET" | "POST"; body?: any; query?: Record<string, string> }
  ) => {
    const qs = new URLSearchParams({ action, ...(opts?.query || {}) }).toString();
    const { data, error, skipped } = await invokeAuthenticatedFunction(
      `lovable-credits-api?${qs}`,
      { method: opts?.method ?? "GET", body: opts?.body }
    );
    if (skipped) throw new Error("Sessão expirada");
    if (error) {
      let parsed: any = null;
      try {
        parsed = await (error as any)?.context?.json?.();
      } catch {}
      const e: any = new Error(parsed?.error ?? parsed?.message ?? error.message);
      e.code = parsed?.code ?? parsed?.details?.code;
      throw e;
    }
    if (data?.error) {
      const e: any = new Error(typeof data.error === "string" ? data.error : "Erro");
      e.code = data?.code;
      throw e;
    }
    return data;
  };

  const handleCreateOrder = async () => {
    if (!plan) return;
    if (!costPrice) {
      toast.error("Preço de custo não definido para este pacote.");
      return;
    }
    if (balance < costPrice) {
      toast.error("Saldo insuficiente. Recarregue seu saldo na plataforma.");
      return;
    }

    setSubmitting(true);
    try {
      const r = await call("reseller_create_order", {
        method: "POST",
        body: { creditos: plan.credits_amount, tipo_entrega: deliveryType, mode },
      });
      const d = r?.data ?? r;
      const pedidoId: string | undefined = d?.providerPedidoId ?? d?.pedidoId ?? d?.id;
      if (!pedidoId) throw new Error("Provedor não retornou pedidoId.");

      setLastOrder({
        ...d,
        id: pedidoId,
        pedidoId,
        creditosEnviados: d?.creditos ?? plan.credits_amount,
        status: d?.status,
      });
      toast.success("Pagamento confirmado!");
      setStep("delivery");
      if (mode === "manual") setManualSubStep("invite");
      onSuccess?.();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (
        err?.code === "INSUFFICIENT_BALANCE" ||
        msg.includes("INSUFFICIENT_BALANCE") ||
        msg.toLowerCase().includes("saldo insuficiente")
      ) {
        setShowError(true);
      } else {
        toast.error(msg || "Ocorreu um erro ao processar seu pedido.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const refreshOrder = async () => {
    const orderId = lastOrder?.id ?? lastOrder?.pedidoId;
    if (!orderId) return;
    setRefreshing(true);
    try {
      const o = await call("order_details", { query: { id: orderId } });
      const od = o?.data ?? o;
      setLastOrder((prev) => ({ ...(prev || {}), ...od, id: orderId }));
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao consultar pedido");
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-poll order details on delivery step until bot email arrives (apenas modo automático)
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    const id = lastOrder?.id ?? lastOrder?.pedidoId;
    if (mode !== "automatico" || step !== "delivery" || !id || lastOrder?.emailConviteBot) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const o = await call("order_details", { query: { id } });
        const od = o?.data ?? o;
        setLastOrder((prev) => ({ ...(prev || {}), ...od, id }));
      } catch {}
      if (attempts >= 20 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lastOrder?.id, lastOrder?.pedidoId, lastOrder?.emailConviteBot]);

  // Auto-poll for status updates in manual mode (tracking sub-step)
  const manualPollRef = useRef<number | null>(null);
  useEffect(() => {
    const id = lastOrder?.id ?? lastOrder?.pedidoId;
    const isDelivered = (lastOrder?.status ?? "").toLowerCase().includes("entreg");
    if (mode !== "manual" || step !== "delivery" || manualSubStep !== "tracking" || !id || isDelivered) {
      if (manualPollRef.current) {
        clearInterval(manualPollRef.current);
        manualPollRef.current = null;
      }
      return;
    }
    const tick = async () => {
      try {
        const o = await call("order_details", { query: { id } });
        const od = o?.data ?? o;
        setLastOrder((prev) => ({ ...(prev || {}), ...od, id }));
      } catch {}
    };
    tick();
    manualPollRef.current = window.setInterval(tick, 5000);
    return () => {
      if (manualPollRef.current) {
        clearInterval(manualPollRef.current);
        manualPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, manualSubStep, lastOrder?.id, lastOrder?.pedidoId, lastOrder?.status]);

  const saveManualMetadata = async (inviteStatus: "pending" | "sent" | "confirmed") => {
    const pedidoId = lastOrder?.id ?? lastOrder?.pedidoId;
    if (!pedidoId) return;
    setSavingMeta(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const { data: reseller, error: rErr } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!reseller?.id) throw new Error("Revendedor não encontrado");
      const { error } = await supabase
        .from("manual_recharge_metadata")
        .upsert(
          {
            reseller_id: reseller.id,
            provider_pedido_id: String(pedidoId),
            workspace_name: workspaceName.trim() || null,
            invite_status: inviteStatus,
          },
          { onConflict: "provider_pedido_id" }
        );
      if (error) throw error;
      return true;
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar dados do pedido manual");
      return false;
    } finally {
      setSavingMeta(false);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const orderId = lastOrder?.id ?? lastOrder?.pedidoId ?? "";
  const trackUrl = orderId ? `https://lovconnect.store/recargas/${orderId}` : "";
  const creditAmount = lastOrder?.creditosEnviados ?? plan?.credits_amount ?? "";
  const clientMsg =
    `✨ *Pedido confirmado com sucesso!* ✨\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Olá! 👋\n\n` +
    `Sua recarga de *${creditAmount} créditos Lovable* já está garantida. 🚀\n\n` +
    (mode === "manual" && workspaceName.trim()
      ? `🗂️ *Workspace:* ${workspaceName.trim()}\n\n`
      : "") +
    `🔎 *Acompanhe em tempo real:*\n${trackUrl}\n\n` +
    (mode === "manual"
      ? `⏱️ *Entrega manual:* nossa equipe está processando — você receberá a confirmação assim que os créditos caírem no workspace.\n\n`
      : `⚡ *Entrega automática:* leva apenas alguns minutos para concluir.\n\n`) +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Obrigado pela confiança! 💙\n` +
    `Qualquer dúvida, é só me chamar. 💬`;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4 pr-10 sm:px-6 sm:pt-6 sm:pr-12">
            <div className="gap-2 mb-1 text-center flex items-center justify-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border text-center",
                  mode === "automatico"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                )}
              >
                {mode === "automatico" ? (
                  <>
                    <Zap className="h-3 w-3" /> Modo Automático
                  </>
                ) : (
                  <>
                    <Hand className="h-3 w-3" /> Modo Manual
                  </>
                )}
              </span>
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-center">
              {step === "review" && "Revisar pedido"}
              {step === "delivery" && "Entrega do pacote"}
              {step === "success" && "Tudo pronto!"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground text-center">
              {step === "review" && `Recargas de ${plan?.credits_amount}`}
              {step === "delivery" && "Convide o bot no workspace do cliente."}
              {step === "success" && "Compartilhe o link de acompanhamento."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 py-3 px-1 sm:px-2">
            {[
              { k: "review" as const, label: "Revisão", icon: Wallet },
              { k: "delivery" as const, label: "Entrega", icon: Send },
              { k: "success" as const, label: "Confirmação", icon: CheckCircle2 },
            ].map((s, i) => {
              const stepIdx = step === "review" ? 0 : step === "delivery" ? 1 : 2;
              const active = i === stepIdx;
              const done = i < stepIdx;
              const Icon = s.icon;
              return (
                <div key={s.k} className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all",
                        active && "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110",
                        done && "border-emerald-500 bg-emerald-500 text-white",
                        !active && !done && "border-border bg-card text-muted-foreground"
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider hidden sm:inline",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div
                      className={cn(
                        "h-0.5 w-8 rounded-full transition-all",
                        done ? "bg-emerald-500" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* STEP 1: Review — payment confirmation */}
          {step === "review" && plan && (
            <div className="space-y-4">
              {/* Hero pricing card */}
              <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
                <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Você está comprando
                      </div>
                      <div className="text-2xl font-bold">
                        {plan.credits_amount} <span className="text-primary">Lovables</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{plan.label}</div>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Package className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-background/60 backdrop-blur p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Valor a pagar
                      </div>
                      <div className="text-xl font-bold text-primary tabular-nums">
                        {formatBRL(costPrice)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 backdrop-blur p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Cai do seu saldo
                      </div>
                      <div className="text-xl font-bold tabular-nums">
                        − {formatBRL(costPrice)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance summary */}
              <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Saldo atual</span>
                  <span className="font-semibold tabular-nums">{formatBRL(balance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Desconto do pedido</span>
                  <span className="font-semibold text-destructive tabular-nums">
                    − {formatBRL(costPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-sm font-semibold">Saldo após</span>
                  <span className="text-lg font-bold text-emerald-500 tabular-nums">
                    {formatBRL(Math.max(0, balance - costPrice))}
                  </span>
                </div>
              </div>

              {/* Policy agreement */}
              <button
                type="button"
                onClick={() => setAgreed((v) => !v)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                  agreed
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/30 hover:border-primary/40"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                    agreed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  )}
                >
                  {agreed && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <div className="text-sm font-semibold leading-snug">
                      Estou de acordo com as políticas de entrega
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPolicyOpen(true); }}
                      className="w-fit text-[11px] font-bold text-primary hover:underline underline-offset-2 sm:shrink-0"
                    >
                      Ver mais
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Após a confirmação, o pedido é processado e o valor é debitado do meu saldo
                    imediatamente. Entendo o fluxo de entrega via convite no workspace.
                  </div>
                </div>
              </button>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateOrder}
                  disabled={!agreed || balance < costPrice || submitting}
                  className="min-w-[180px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...
                    </>
                  ) : (
                    <>
                      Pagar e confirmar <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* STEP 2: Delivery — bot email + instructions */}
          {step === "delivery" && plan && (
            <div className="space-y-4">
              {/* Mode confirmation banner */}
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  mode === "automatico"
                    ? "border-primary/30 bg-primary/5"
                    : "border-amber-500/30 bg-amber-500/5"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    mode === "automatico"
                      ? "bg-primary text-primary-foreground"
                      : "bg-amber-500 text-white"
                  )}
                >
                  {mode === "automatico" ? <Zap className="h-5 w-5" /> : <Hand className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Meio de entrega
                  </div>
                  <div className="font-semibold">
                    {mode === "automatico" ? "Automático" : "Manual"} · Workspace Próprio
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>

              {mode === "automatico" ? (
                <>
                  {/* Bot email card */}
                  <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
                    <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Email do bot
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Convide este email no workspace do cliente
                          </div>
                        </div>
                      </div>
                      {lastOrder?.emailConviteBot ? (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/70 backdrop-blur px-3 py-2.5">
                          <code className="text-sm font-mono font-semibold break-all">
                            {lastOrder.emailConviteBot}
                          </code>
                          <Button
                            size="sm"
                            onClick={() => copy(lastOrder.emailConviteBot!)}
                            className="shrink-0 h-8"
                          >
                            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Gerando email do bot...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5 text-primary" /> Como entregar
                    </div>
                    <ol className="space-y-2.5">
                      {[
                        "Copie o email do bot acima",
                        "Peça ao cliente para te adicionar como membro no workspace dele (ou faça você mesmo, se tiver acesso)",
                        "Cole o email do bot e envie o convite",
                        "Volte aqui e clique em 'Convite enviado' para finalizar",
                      ].map((txt, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                            {i + 1}
                          </span>
                          <span className="text-foreground/80">{txt}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-foreground/80">
                      Os <strong>Lovables só caem</strong> no workspace após o bot aceitar o convite.
                      Mantenha esta janela aberta até finalizar.
                    </span>
                  </div>
                </>
              ) : manualSubStep === "invite" ? (
                <>
                  {/* Manual sub-step indicator */}
                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">1</span>
                    <span className="shrink-0">Convite</span>
                    <div className="h-px flex-1 bg-border" />
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground">2</span>
                    <span className="shrink-0">Acompanhar</span>
                  </div>

                  {/* Bot email card (manual) */}
                  <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-5">
                    <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl" />
                    <div className="relative space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Email do bot manual
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Convide como <strong>Editor</strong> e depois promova para <strong>Owner</strong>
                          </div>
                        </div>
                      </div>
                       <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/70 backdrop-blur px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                         <code className="min-w-0 text-sm font-mono font-semibold break-all">
                          {MANUAL_BOT_EMAIL}
                        </code>
                        <Button
                          size="sm"
                          onClick={() => copy(MANUAL_BOT_EMAIL)}
                           className="h-8 w-full sm:w-auto sm:shrink-0"
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Workspace name input */}
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
                    <Label htmlFor="workspaceName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Nome do workspace do cliente
                    </Label>
                    <Input
                      id="workspaceName"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Ex.: Loja do João"
                      maxLength={120}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O gerente usa esse nome para localizar e entregar o Lovable.
                    </p>
                  </div>

                  {/* Step-by-step instructions */}
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5 text-primary" /> Passo a passo do convite
                    </div>
                    <ol className="space-y-2.5">
                      {[
                        <>Abra o workspace do cliente no Lovable.</>,
                        <>Convide o email <code className="font-mono bg-muted/40 px-1.5 py-0.5 rounded text-[11px]">{MANUAL_BOT_EMAIL}</code> como <strong>Editor</strong>.</>,
                        <>Depois que o bot aceitar, <strong>promova para Owner</strong> no menu de membros.</>,
                        <>Volte aqui e clique em <strong>"Convite enviado, ir para acompanhamento"</strong>.</>,
                      ].map((txt, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-500">
                            {i + 1}
                          </span>
                          <span className="text-foreground/80">{txt}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-foreground/80">
                      Sem promover para <strong>Owner</strong>, o gerente não consegue depositar os recargas.
                    </span>
                  </div>

                  <DialogFooter className="gap-2 flex-col sm:flex-row">
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={savingMeta} className="w-full sm:w-auto">
                      Fechar
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!workspaceName.trim()) {
                          toast.error("Informe o nome do workspace");
                          return;
                        }
                        const ok = await saveManualMetadata("sent");
                        if (ok) setManualSubStep("tracking");
                      }}
                      disabled={!workspaceName.trim() || savingMeta}
                      className="w-full sm:w-auto sm:min-w-[260px]"
                    >
                      {savingMeta ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando...</>
                      ) : (
                        <>Convite enviado, ir para acompanhamento <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  {/* Manual sub-step indicator */}
                  <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <CheckCircle2 className="h-3 w-3" />
                    </span>
                    <span className="shrink-0">Convite</span>
                    <div className="h-px flex-1 min-w-[12px] bg-emerald-500/60" />
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">2</span>
                    <span className="shrink-0">Acompanhar</span>
                  </div>

                  {/* Status timeline */}
                  {(() => {
                    const rawStatus = (lastOrder?.status ?? "").toLowerCase();
                    const isDelivered = rawStatus.includes("entreg") || rawStatus.includes("conclu") || rawStatus.includes("complet");
                    const isProcessing = !isDelivered && (rawStatus.includes("process") || rawStatus.includes("andament") || rawStatus.includes("prepar"));
                    const stages = [
                      { key: "received", label: "Pedido recebido", desc: "Registrado no sistema", done: true, active: !isProcessing && !isDelivered },
                      { key: "processing", label: "Em processamento", desc: "Gerente preparando a entrega", done: isProcessing || isDelivered, active: isProcessing && !isDelivered },
                      { key: "delivered", label: "Entregue", desc: "Lovables no workspace", done: isDelivered, active: isDelivered },
                    ];
                    return (
                      <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-primary" /> Status da entrega
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={refreshOrder}
                            disabled={refreshing}
                            className="h-7"
                          >
                            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            <span className="ml-1.5 text-[11px]">Atualizar</span>
                          </Button>
                        </div>
                        <ol className="space-y-3">
                          {stages.map((s, i) => (
                            <li key={s.key} className="flex gap-3 items-start">
                              <div className="flex flex-col items-center">
                                <div
                                  className={cn(
                                    "h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all",
                                    s.done && "border-emerald-500 bg-emerald-500 text-white",
                                    s.active && !s.done && "border-amber-500 bg-amber-500 text-white animate-pulse",
                                    !s.done && !s.active && "border-border bg-background text-muted-foreground"
                                  )}
                                >
                                  {s.done ? (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  ) : s.active ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <span className="text-[10px] font-bold">{i + 1}</span>
                                  )}
                                </div>
                                {i < stages.length - 1 && (
                                  <div className={cn("w-0.5 flex-1 min-h-[18px] mt-1", s.done ? "bg-emerald-500" : "bg-border")} />
                                )}
                              </div>
                              <div className="flex-1 pb-1">
                                <div className={cn("text-sm font-semibold", s.active && "text-amber-500", s.done && "text-foreground")}>
                                  {s.label}
                                </div>
                                <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                              </div>
                            </li>
                          ))}
                        </ol>
                        {workspaceName.trim() && (
                          <div className="rounded-lg border border-border bg-background/40 p-3 text-xs flex items-start justify-between gap-3 min-w-0">
                            <span className="text-muted-foreground">Workspace</span>
                            <span className="min-w-0 break-words text-right font-semibold">{workspaceName.trim()}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Tracking link */}
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <ExternalLink className="h-3 w-3 text-primary" /> Página de acompanhamento
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 min-w-0">
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono text-primary truncate min-w-0 flex-1 hover:underline"
                      >
                        {trackUrl}
                      </a>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => copy(trackUrl)} className="h-7 w-7 p-0">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" asChild className="h-7 w-7 p-0">
                          <a href={trackUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}


              {/* Botão de copiar mensagem pronta — escondido no sub-step de convite manual */}
              {!(mode === "manual" && manualSubStep === "invite") && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => copy(clientMsg)}
                  disabled={!trackUrl}
                >
                  <Copy className="h-3.5 w-3.5 mr-2" /> Copiar mensagem pronta para o cliente
                </Button>
              )}

              {/* Footer — só renderiza fora do sub-step "invite" manual (que tem seu próprio footer) */}
              {!(mode === "manual" && manualSubStep === "invite") && (
                <DialogFooter className="gap-2 flex-col sm:flex-row">
                  {mode === "automatico" ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setInviteSent(true)}
                        className={cn("w-full sm:w-auto", inviteSent && "border-emerald-500 text-emerald-500")}
                      >
                        {inviteSent ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" /> Convite marcado
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-2" /> Convite enviado
                          </>
                        )}
                      </Button>
                      <Button onClick={() => setStep("success")} disabled={!inviteSent} className="w-full sm:w-auto">
                        Finalizar entrega <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setManualSubStep("invite")} className="w-full sm:w-auto">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => (window.location.href = "/painel/revendedor/licencas")}
                        className="w-full sm:w-auto"
                      >
                        <ListChecks className="h-4 w-4 mr-2" /> Transações
                      </Button>
                      <Button onClick={() => setStep("success")} className="w-full sm:w-auto">
                        Concluir <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </>
                  )}
                </DialogFooter>
              )}
            </div>
          )}

          {/* STEP 3: Success — final confirmation */}
          {step === "success" && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-6 text-center">
                <Sparkles className="absolute top-4 left-6 h-3 w-3 text-emerald-400/60 animate-pulse" />
                <Sparkles
                  className="absolute bottom-4 right-8 h-3 w-3 text-emerald-400/60 animate-pulse"
                  style={{ animationDelay: "300ms" }}
                />
                <Sparkles
                  className="absolute top-8 right-12 h-2 w-2 text-emerald-400/60 animate-pulse"
                  style={{ animationDelay: "600ms" }}
                />
                <div className="relative inline-flex items-center justify-center mb-3">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-xl animate-pulse" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40">
                    <Rocket className="h-8 w-8" strokeWidth={2.5} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold mb-1">Entrega finalizada!</h3>
                <p className="text-sm text-muted-foreground">
                  {lastOrder?.creditosEnviados ?? plan?.credits_amount} Lovables a caminho do workspace.
                </p>
              </div>

              {/* Next steps */}
              <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5 text-primary" /> Últimos passos
                </div>
                <ol className="space-y-2.5">
                  {[
                    "Envie o link de acompanhamento abaixo para o cliente",
                    "Cole a mensagem pronta no WhatsApp para confirmar a entrega",
                    "Aguarde alguns minutos — o bot conclui o processo sozinho",
                  ].map((txt, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-500">
                        {i + 1}
                      </span>
                      <span className="text-foreground/80">{txt}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tracking link */}
              <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ExternalLink className="h-3 w-3 text-primary" /> Link de acompanhamento
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-primary truncate hover:underline"
                  >
                    {trackUrl}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(trackUrl)}
                    className="shrink-0 h-7 w-7 p-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Botão de copiar mensagem pronta */}
              <Button size="sm" className="w-full" onClick={() => copy(clientMsg)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar mensagem pronta para o cliente
              </Button>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  ID: <code className="font-mono">{orderId}</code>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshOrder}
                  disabled={refreshing}
                  className="h-7"
                >
                  {refreshing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  <span className="ml-1.5 text-[11px]">Atualizar</span>
                </Button>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Fechar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = "/painel/revendedor/licencas")}
                >
                  <ListChecks className="h-4 w-4 mr-2" /> Meus pedidos
                </Button>
                <Button onClick={reset}>
                  <PlusCircle className="h-4 w-4 mr-2" /> Novo pedido
                </Button>
              </DialogFooter>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Policies modal */}
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden p-4 pr-10 sm:p-6 sm:pr-12">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Políticas de Entrega</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Leia atentamente antes de confirmar seu pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-foreground/90">
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">1. Confirmação e Débito</h4>
              <p className="text-muted-foreground leading-relaxed">
                Após a confirmação do pagamento via PIX, o pedido é processado imediatamente e o valor correspondente é debitado do seu saldo de revendedor. Não é possível cancelar ou estornar o pedido após essa etapa, exceto em casos de falha comprovada na entrega.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">2. Fluxo de Entrega — Modo Automático</h4>
              <p className="text-muted-foreground leading-relaxed">
                No modo automático, um bot especializado é convidado para o workspace do cliente como Editor e, em seguida, promovido a Owner. Os recargas são transferidos automaticamente para a conta do cliente assim que o bot aceitar o convite e assumir a propriedade do workspace.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">3. Fluxo de Entrega — Modo Manual</h4>
              <p className="text-muted-foreground leading-relaxed">
                No modo manual, o pedido entra em uma fila de processamento após a confirmação do PIX. A equipe responsável realiza a entrega dos recargas no workspace do cliente em até 24 horas úteis. Você poderá acompanhar o status do pedido em tempo real pela página de transações.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">4. Responsabilidades do Revendedor</h4>
              <ul className="list-disc list-inside text-muted-foreground leading-relaxed space-y-1">
                <li>Informar corretamente o email e o nome do workspace do cliente.</li>
                <li>Enviar o convite para o bot no workspace indicado (quando aplicável).</li>
                <li>Promover o bot a Owner após o aceite do convite (modo automático).</li>
                <li>Comunicar ao cliente o prazo e o modo de entrega contratado.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">5. Prazos e Garantias</h4>
              <p className="text-muted-foreground leading-relaxed">
                O prazo de entrega no modo automático é de poucos minutos após o convite ser aceito. No modo manual, o prazo é de até 24 horas úteis. Em caso de falha comprovada na entrega, a plataforma realizará o reembolso integral dos recargas debitados do seu saldo.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">6. Suporte</h4>
              <p className="text-muted-foreground leading-relaxed">
                Em caso de dúvidas ou problemas na entrega, entre em contato com o suporte informando o ID do pedido e os detalhes do workspace do cliente.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error modal */}
      <Dialog open={showError} onOpenChange={setShowError}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">Aviso Importante</DialogTitle>
            <DialogDescription className="text-center pt-2">
              Erro com a criação do pedido, informe o seu gerente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setShowError(false)}
              className="min-w-[120px]"
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
