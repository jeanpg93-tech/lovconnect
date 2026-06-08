import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Copy,
  Check,
  Mail,
  Sparkles,
  AlertCircle,
  PlayCircle,
  Calendar,
  Zap,
  PauseCircle,
  XCircle,
  PartyPopper,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

type Delivery = {
  day_number: number;
  scheduled_date: string;
  credits: number;
  status: string;
  delivered_at: string | null;
};

type PlanData = {
  id: string;
  token: string;
  status: string;
  customer_name: string | null;
  workspace_name: string | null;
  owner_email_required: string;
  owner_email_added_at: string | null;
  duration_days: number;
  credits_per_day: number;
  total_credits_cap: number;
  delivery_hour: number;
  sale_price_cents: number;
  started_at: string | null;
  ends_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  completed_at: string | null;
  plan: {
    name: string;
    description: string | null;
    bot_owner_email: string;
  } | null;
  deliveries: Delivery[];
};

const fmtBRL = (c?: number) =>
  c == null
    ? "—"
    : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export default function PublicPlano() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const call = useCallback(
    async (action: string, body?: Record<string, unknown>) => {
      const qs = new URLSearchParams({ action, token: token ?? "" }).toString();
      const { data: res, error } = await supabase.functions.invoke(
        `recharge-plan-public?${qs}`,
        { method: body ? "POST" : "GET", body },
      );
      if (error) {
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) {
            const j = await ctx.json();
            if (j?.error) throw new Error(j.error);
          }
        } catch (inner: any) {
          if (inner instanceof Error) throw inner;
        }
        throw new Error(error.message);
      }
      if (res?.error) throw new Error(res.error);
      return res?.data as PlanData;
    },
    [token],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const d = await call("get");
        setData(d);
        setError(null);
      } catch (e: any) {
        setError(e.message ?? "Pedido não encontrado");
      } finally {
        setLoading(false);
      }
    },
    [call],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [load]);

  const copyEmail = async () => {
    if (!data?.owner_email_required) return;
    await navigator.clipboard.writeText(data.owner_email_required);
    setEmailCopied(true);
    toast.success("Email copiado");
    setTimeout(() => setEmailCopied(false), 1500);
  };

  const submitWorkspace = async () => {
    const name = workspaceInput.trim();
    if (name.length < 2) {
      toast.error("Digite o nome do workspace");
      return;
    }
    setSubmitting(true);
    try {
      const d = await call("set_workspace", { workspace_name: name });
      setData(d);
      toast.success("Configuração salva. Revise e confirme o início.");
    } catch (e: any) {
      toast.error("Falha", { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmStart = async () => {
    setConfirming(true);
    try {
      const d = await call("confirm_start", {});
      setData(d);
      setConfirmOpen(false);
      toast.success("Entrega iniciada!");
    } catch (e: any) {
      toast.error("Falha", { description: e.message });
    } finally {
      setConfirming(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const d = await call("cancel", { reason: "Cancelado pelo cliente" });
      setData(d);
      setCancelOpen(false);
      toast.success("Pedido cancelado");
    } catch (e: any) {
      toast.error("Falha", { description: e.message });
    } finally {
      setCancelling(false);
    }
  };

  const deliveredCount = useMemo(
    () => (data?.deliveries ?? []).filter((d) => d.status === "delivered").length,
    [data],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/40">
              <Zap className="h-5 w-5 text-violet-300" />
            </div>
          </div>
          <p className="text-sm text-zinc-400">Carregando…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <AlertCircle className="h-7 w-7 text-rose-300" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">
            Pedido não encontrado
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {error ?? "Verifique o link recebido."}
          </p>
        </div>
      </div>
    );
  }

  const status = data.status;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-zinc-100 px-3 sm:px-4 py-6 sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(168,85,247,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(168,85,247,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at top, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at top, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-xl space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-200">
            <Sparkles className="h-3 w-3" />
            {data.plan?.name ?? "Plano de créditos"}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {data.credits_per_day.toLocaleString("pt-BR")} créditos/dia •{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
              {data.duration_days} dias
            </span>
          </h1>
          {data.customer_name && (
            <p className="text-xs sm:text-sm text-zinc-400">
              Olá <strong className="text-zinc-200">{data.customer_name}</strong>! Acompanhe seu plano aqui.
            </p>
          )}
        </div>

        {/* ESTADO 1: AGUARDANDO CONFIGURAÇÃO DO WORKSPACE */}
        {status === "awaiting_owner" && (
          <div className="rounded-2xl border border-amber-400/30 bg-zinc-950/85 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  Etapa 1 de 2
                </div>
                <div className="text-base font-bold">Adicione nosso bot como Owner</div>
              </div>
            </div>

            <div className="text-sm text-zinc-300 leading-relaxed">
              Para que possamos entregar os créditos no seu workspace do Lovable,
              adicione o email abaixo como <strong>Owner</strong> do workspace
              que vai receber a recarga:
            </div>

            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-violet-200 truncate">
                {data.owner_email_required || "(não configurado pelo gerente)"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyEmail}
                disabled={!data.owner_email_required}
              >
                {emailCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div>
              <Label className="text-zinc-300">Nome do seu workspace</Label>
              <Input
                value={workspaceInput}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                placeholder="Ex: meu-workspace"
                className="bg-zinc-900 border-zinc-800"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Confira no Lovable, no canto superior esquerdo.
              </p>
            </div>

            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelOpen(true)}
                className="text-zinc-500 hover:text-rose-400"
              >
                Cancelar pedido
              </Button>
              <Button onClick={submitWorkspace} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Já adicionei — continuar
              </Button>
            </div>
          </div>
        )}

        {/* ESTADO 2: AGUARDANDO CONFIRMAÇÃO */}
        {status === "awaiting_confirm" && (
          <div className="rounded-2xl border border-violet-400/30 bg-zinc-950/85 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30">
                <PlayCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  Etapa 2 de 2
                </div>
                <div className="text-base font-bold">Confira e confirme o início</div>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3 space-y-2 text-sm">
              <Row label="Workspace" value={data.workspace_name ?? "—"} />
              <Row label="Email Owner adicionado" value={data.owner_email_required} />
              <Row label="Créditos por dia" value={data.credits_per_day.toLocaleString("pt-BR")} />
              <Row label="Duração" value={`${data.duration_days} dias`} />
              <Row label="Total no período" value={data.total_credits_cap.toLocaleString("pt-BR")} />
              <Row label="Horário de entrega" value={`${String(data.delivery_hour).padStart(2, "0")}h (BRT)`} />
              <Row label="Valor pago" value={fmtBRL(data.sale_price_cents)} />
            </div>

            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-amber-200 flex gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Atenção:</strong> após confirmar o início, o pedido{" "}
                <strong>não poderá mais ser cancelado nem reembolsado</strong>.
                Confira tudo com cuidado antes de continuar.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-[12px] text-zinc-400 flex gap-2">
              <Clock className="h-4 w-4 shrink-0 mt-0.5 text-zinc-500" />
              <div>
                A primeira entrega pode levar até <strong>2 horas</strong> após
                a confirmação. Se nada acontecer nesse prazo, o pedido será
                cancelado e o valor reembolsado.
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCancelOpen(true)}
                className="text-zinc-500 hover:text-rose-400"
              >
                Cancelar pedido
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Confirmar e iniciar entrega
              </Button>
            </div>
          </div>
        )}

        {/* ESTADO 3: ATIVO */}
        {status === "active" && (
          <div className="rounded-2xl border border-emerald-400/30 bg-zinc-950/85 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  Plano ativo
                </div>
                <div className="text-base font-bold">
                  {deliveredCount} de {data.duration_days} entregas concluídas
                </div>
              </div>
            </div>

            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all"
                  style={{
                    width: `${Math.round((deliveredCount / Math.max(1, data.duration_days)) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                <span>Início: {fmtDate(data.started_at)}</span>
                <span>Fim: {fmtDate(data.ends_at)}</span>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3 space-y-2 text-sm">
              <Row label="Workspace" value={data.workspace_name ?? "—"} />
              <Row label="Créditos por dia" value={data.credits_per_day.toLocaleString("pt-BR")} />
              <Row label="Horário de entrega" value={`${String(data.delivery_hour).padStart(2, "0")}h (BRT)`} />
            </div>

            {data.deliveries.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  Próximas entregas
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {data.deliveries.slice(0, 30).map((d) => {
                    const cls =
                      d.status === "delivered"
                        ? "bg-emerald-500/30 ring-emerald-400/50 text-emerald-100"
                        : d.status === "failed"
                          ? "bg-rose-500/20 ring-rose-400/40 text-rose-200"
                          : d.status === "skipped"
                            ? "bg-zinc-700/30 ring-zinc-600/40 text-zinc-500"
                            : "bg-zinc-900 ring-zinc-800 text-zinc-500";
                    return (
                      <div
                        key={d.day_number}
                        title={`Dia ${d.day_number} • ${d.scheduled_date} • ${d.status}`}
                        className={`aspect-square rounded text-[10px] font-bold flex items-center justify-center ring-1 ${cls}`}
                      >
                        {d.day_number}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ESTADO 4: ENCERRADO (paused/cancelled/completed/expired) */}
        {(status === "paused" || status === "cancelled" || status === "completed" || status === "expired") && (
          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950/85 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${
                  status === "completed"
                    ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30"
                    : status === "paused"
                      ? "bg-amber-500/20 text-amber-200 ring-amber-400/30"
                      : "bg-rose-500/20 text-rose-200 ring-rose-400/30"
                }`}
              >
                {status === "completed" ? (
                  <PartyPopper className="h-5 w-5" />
                ) : status === "paused" ? (
                  <PauseCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </div>
                <div className="text-base font-bold capitalize">
                  {status === "completed"
                    ? "Plano concluído"
                    : status === "paused"
                      ? "Plano pausado"
                      : status === "expired"
                        ? "Plano expirado"
                        : "Pedido cancelado"}
                </div>
              </div>
            </div>
            {data.cancelled_reason && (
              <p className="text-xs text-zinc-500">Motivo: {data.cancelled_reason}</p>
            )}
            {data.completed_at && (
              <p className="text-xs text-zinc-500">
                Encerrado em {fmtDate(data.completed_at)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Dialog: confirmar início */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar início da entrega</DialogTitle>
            <DialogDescription>
              Após confirmar, <strong>não será mais possível cancelar</strong> nem
              solicitar reembolso. Tem certeza?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <Row label="Workspace" value={data.workspace_name ?? "—"} dark />
            <Row label="Duração" value={`${data.duration_days} dias`} dark />
            <Row label="Créditos/dia" value={data.credits_per_day.toLocaleString("pt-BR")} dark />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Voltar
            </Button>
            <Button onClick={confirmStart} disabled={confirming}>
              {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sim, confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cancelar */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>
              Você ainda não confirmou o início, então pode cancelar agora. Tem
              certeza?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={cancelling}>
              {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className={dark ? "text-muted-foreground" : "text-zinc-500"}>{label}</span>
      <span className={`font-medium text-right truncate ${dark ? "" : "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}