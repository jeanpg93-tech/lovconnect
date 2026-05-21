import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Copy,
  Mail,
  ShieldCheck,
  RefreshCw,
  Rocket,
  CheckCircle2,
  FileText,
  ArrowRight,
  Check,
  AlertCircle,
  Zap,
  ChevronLeft,
  ChevronRight,
  Crown,
  X,
  Sparkles,
  PartyPopper,
  Link2Off,
} from "lucide-react";
import { toast } from "sonner";
import tutorialStep1 from "@/assets/tutorial-step1.webp";
import tutorialStep2 from "@/assets/tutorial-step2.webp";
import tutorialStep3 from "@/assets/tutorial-step3.webp";

type OrderData = {
  id?: string;
  pedidoId?: string;
  status?: string;
  statusLabel?: string;
  manual?: boolean;
  errorMessage?: string | null;
  managerNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  creditos?: number;
  precoReais?: string;
  precoCentavos?: number;
  emailConviteBot?: string;
  workspaceId?: string;
  workspaceName?: string;
  creditosEnviados?: number;
  etapaProcessamento?: number;
  tipoEntrega?: string;
  mensagemBot?: string;
  creditsGranted?: number | null;
  creditsUsed?: number | null;
  creditsGrantedEnd?: number | null;
  creditsUsedEnd?: number | null;
  clienteConfirmouConvite?: boolean;
  permissaoWorkspaceAdmin?: boolean;
  statusVerificacaoConvite?: string | null;
  codigoConviteStatus?: number | string | null;
  cancelar?: boolean;
};

type ActionResult = {
  id?: string;
  status?: string;
  resultado?: {
    motivo?: string;
    workspace_id?: string;
    workspace_nome?: string;
  };
};

// Tutoriais por passo
const TUTORIAL_EDITOR = [
  {
    img: tutorialStep1,
    title: "Abra o menu do workspace",
    desc: "Na página inicial do Lovable, clique no nome do seu workspace no canto superior esquerdo.",
  },
  {
    img: tutorialStep2,
    title: "Clique em 'Invite members'",
    desc: "No menu que abrir, clique em 'Invite members' para abrir as configurações de pessoas.",
  },
  {
    img: tutorialStep3,
    title: "Convide como 'Editor'",
    desc: "Cole o email do bot, selecione a permissão 'Editor' e clique em 'Invite'.",
  },
];

const TUTORIAL_OWNER = [
  {
    img: tutorialStep2,
    title: "Volte em 'Members'",
    desc: "No mesmo menu do workspace, abra novamente 'Invite members' / 'Members'.",
  },
  {
    img: tutorialStep3,
    title: "Localize o bot na lista",
    desc: "Encontre o email do bot que você acabou de convidar. Ele aparece como 'Editor'.",
  },
  {
    img: tutorialStep3,
    title: "Mude para 'Owner'",
    desc: "Clique no papel atual ('Editor') ao lado do bot e selecione 'Owner'. Confirme a transferência.",
  },
];

const fmtBRL = (cents?: number, reais?: string) => {
  const v = typeof cents === "number" ? cents / 100 : reais != null ? Number(String(reais)) : null;
  if (v == null || isNaN(v)) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Mapeia status do pedido para o passo atual do wizard (0,1,2)
function statusToStep(
  status: string,
  flags?: { clienteConfirmouConvite?: boolean; permissaoWorkspaceAdmin?: boolean; statusVerificacaoConvite?: string | null }
): number {
  // Etapa final (recarregando/entregando/sucesso) ou bot já como Owner confirmado
  if (status === "sucesso" || status === "recarregando" || status === "entregando") return 2;
  if (flags?.permissaoWorkspaceAdmin || flags?.statusVerificacaoConvite === "confirmado") return 2;
  // Bot detectou convite mas como Editor → cliente precisa promover a Owner
  if (flags?.statusVerificacaoConvite === "permissao_incorreta") return 1;
  // Convite não encontrado → cliente ainda precisa enviar/reenviar como Editor
  if (flags?.statusVerificacaoConvite === "nao_encontrado") return 0;
  // Cliente clicou em "já enviei" mas verificação ainda não retornou
  if (flags?.clienteConfirmouConvite) return 1;
  return 0;
}

const STEPS_META = [
  {
    key: "editor",
    label: "Convidar como Editor",
    short: "Editor",
    icon: Mail,
    color: "from-amber-400 to-orange-500",
    soft: "from-amber-500/15 to-orange-500/5",
    border: "border-amber-400/40",
    text: "text-amber-300",
    glow: "shadow-amber-500/40",
  },
  {
    key: "owner",
    label: "Tornar Owner",
    short: "Owner",
    icon: Crown,
    color: "from-violet-400 to-fuchsia-500",
    soft: "from-violet-500/15 to-fuchsia-500/5",
    border: "border-violet-400/40",
    text: "text-violet-300",
    glow: "shadow-violet-500/40",
  },
  {
    key: "delivery",
    label: "Entrega automática",
    short: "Entrega",
    icon: Rocket,
    color: "from-emerald-400 to-teal-500",
    soft: "from-emerald-500/15 to-teal-500/5",
    border: "border-emerald-400/40",
    text: "text-emerald-300",
    glow: "shadow-emerald-500/40",
  },
];

export default function PublicRecharge() {
  const { id: orderId } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAction, setLastAction] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [providerAlert, setProviderAlert] = useState<{ enabled: boolean; message: string; eta_minutes: number | null } | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [submittingWorkspace, setSubmittingWorkspace] = useState(false);
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(false);
  const [confirmWorkspaceOpen, setConfirmWorkspaceOpen] = useState(false);
  const [iniciadoProgress, setIniciadoProgress] = useState(8);

  useEffect(() => {
    const s = String(order?.status ?? "").toLowerCase();
    const isIniciado = s === "manual_iniciado" || s === "manual_processando" || s === "processando";
    if (!isIniciado) {
      setIniciadoProgress(8);
      return;
    }
    const t = setInterval(() => {
      setIniciadoProgress((p) => {
        if (p >= 95) return 95;
        // sobe de pouco em pouco, mais devagar conforme aumenta
        const step = Math.max(0.4, (95 - p) * 0.04);
        return Math.min(95, p + step);
      });
    }, 800);
    return () => clearInterval(t);
  }, [order?.status]);

  // Carrega aviso de lentidão do provedor
  useEffect(() => {
    let cancelled = false;
    const fetchAlert = async () => {
      try {
        const { data } = await supabase.functions.invoke("lovable-credits-public?action=alert", { method: "GET" });
        if (!cancelled && data && !data.error) setProviderAlert(data);
      } catch { /* silencioso */ }
    };
    fetchAlert();
    const t = setInterval(fetchAlert, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const call = async (action: string, query: Record<string, string>, method: "GET" | "POST" = "GET") => {
    const qs = new URLSearchParams({ action, ...query }).toString();
    const { data, error } = await supabase.functions.invoke(`lovable-credits-public?${qs}`, { method });
    if (error) {
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          const msg = body?.error || body?.message;
          if (msg) throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
      } catch (inner: any) {
        if (inner instanceof Error && inner.message) throw inner;
      }
      throw new Error(error.message);
    }
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Erro");
    return data;
  };

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!orderId) return;
      if (!silent) setLoading(true);
      try {
        const r = await call("order", { id: orderId });
        const d = r?.data ?? r;
        setOrder(d);
        setError(null);
      } catch (e: any) {
        setError(e.message ?? "Pedido não encontrado");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    loadOrder();
    const t = setInterval(() => loadOrder(true), 3000);
    return () => clearInterval(t);
  }, [loadOrder]);

  // Reset tutorial step ao trocar de passo
  const status = order?.status ?? "aguardando";
  const currentStep = useMemo(
    () =>
      statusToStep(status, {
        clienteConfirmouConvite: order?.clienteConfirmouConvite,
        permissaoWorkspaceAdmin: order?.permissaoWorkspaceAdmin,
        statusVerificacaoConvite: order?.statusVerificacaoConvite,
      }),
    [status, order?.clienteConfirmouConvite, order?.permissaoWorkspaceAdmin, order?.statusVerificacaoConvite]
  );
  useEffect(() => {
    setTutorialStep(0);
  }, [currentStep]);

  const confirmInvite = async () => {
    if (!orderId) return;
    setConfirming(true);
    setLastAction(null);
    try {
      const r = await call("confirm_invite", { id: orderId }, "POST");
      const d = r?.data ?? r;
      const acaoId: string | undefined = d?.acaoId ?? d?.id;
      if (!acaoId) throw new Error("Sem acaoId na resposta");
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const a = await call("action_status", { id: orderId, acao_id: acaoId });
        const ad = (a?.data ?? a) as ActionResult;
        setLastAction(ad);
        if (ad?.status === "finalizada") break;
      }
      await loadOrder(true);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao verificar");
    } finally {
      setConfirming(false);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    setCopied(true);
    toast.success("Email copiado!");
    setTimeout(() => setCopied(false), 1800);
  };

  const submitWorkspace = async () => {
    if (!orderId) return;
    const name = workspaceInput.trim();
    if (!name) {
      toast.error("Informe o nome do workspace");
      return;
    }
    setSubmittingWorkspace(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        `lovable-credits-public?action=set_workspace&id=${orderId}`,
        { method: "POST", body: { workspace_name: name } }
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Erro");
      setWorkspaceSaved(true);
      setEditingWorkspace(false);
      setConfirmWorkspaceOpen(false);
      setWorkspaceInput("");
      toast.success("Workspace enviado! Aguardando a equipe iniciar.");
      await loadOrder(true);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar workspace");
    } finally {
      setSubmittingWorkspace(false);
    }
  };

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
          <p className="text-sm text-zinc-400">Carregando pedido…</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30">
            <AlertCircle className="h-7 w-7 text-rose-300" />
          </div>
          <h1 className="font-display text-xl font-semibold text-zinc-100">Pedido não encontrado</h1>
          <p className="mt-2 text-sm text-zinc-500">{error ?? "Verifique o link recebido."}</p>
        </div>
      </div>
    );
  }

  const shortId = (order.id ?? order.pedidoId ?? "").toString().slice(0, 8);
  const totalCredits = order.creditos ?? 0;
  const sentCredits = order.creditosEnviados ?? 0;
  const isCancelled =
    status === "cancelado" ||
    status === "falha" ||
    status === "queimado" ||
    status === "reembolsado" ||
    order.cancelar === true;
  const isInvalidInvite = !isCancelled && Number(order.codigoConviteStatus) === 2;

  // === Modo MANUAL: pedido tratado pela equipe da plataforma ===
  if (order.manual) {
    const mStatus = status;
    const isManualDone = mStatus === "manual_concluido" || mStatus === "manual_entregue" || mStatus === "sucesso" || mStatus === "entregue";
    const isManualIniciado = mStatus === "manual_iniciado" || mStatus === "manual_processando" || mStatus === "processando";
    const isManualAceito = mStatus === "manual_aceito" || mStatus === "manual_confirmado";
    const isManualFailed = mStatus === "manual_sem_sucesso" || mStatus === "falha" || mStatus === "cancelado" || mStatus === "reembolsado";
    const isManualPendente = !isManualAceito && !isManualIniciado && !isManualDone && !isManualFailed;
    const manualStages = [
      { key: "recebido", label: "Pedido recebido", desc: "Registramos sua solicitação", done: true, active: isManualPendente },
      { key: "aceito", label: "Pedido aceito — Aguardando configuração", desc: "Confirmamos seu pedido e estamos aguardando a configuração na sua conta", done: isManualAceito || isManualIniciado || isManualDone, active: isManualAceito },
      { key: "configurado", label: "Configurado — Iniciando entrega", desc: "Tudo pronto, sua recarga está a caminho do workspace", done: isManualIniciado || isManualDone, active: isManualIniciado },
      { key: "entregue", label: "Entrega finalizada — Recarga creditada", desc: "Créditos disponíveis no seu workspace", done: isManualDone, active: false },
    ];

    return (
      <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-zinc-100 px-3 sm:px-4 py-6 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(168,85,247,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(168,85,247,0.18) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at top, black 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 30%, transparent 80%)",
          }}
        />

        <div className="relative mx-auto max-w-xl space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
              <Sparkles className="h-3 w-3" /> SUA ENTREGA
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Pedido de{" "}
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-amber-300 bg-clip-text text-transparent">
                {totalCredits.toLocaleString("pt-BR")} créditos
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Acompanhe o status do seu pedido em tempo real
            </p>
          </div>

          {/* Card Workspace (acima do pedido) */}
          {order.workspaceName && (
            <div className="rounded-2xl p-[1.5px] bg-gradient-to-br from-amber-400/50 via-orange-400/20 to-amber-400/50 shadow-xl shadow-amber-900/20">
              <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl p-4 sm:p-5">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Workspace</div>
                    <div className="text-base sm:text-lg font-bold text-white mt-0.5 break-all">{order.workspaceName}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Aviso de pendência — aguardando aceite do provedor */}
          {isManualPendente && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/5 p-4 sm:p-5 shadow-lg shadow-amber-900/20">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 ring-1 ring-amber-400/40">
                  <Loader2 className="h-5 w-5 text-amber-300 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Aguardando aceite</span>
                    <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-amber-50 leading-snug">
                    Aguardando o aceite do provedor, aguarde uns instantes.
                  </p>
                  <p className="mt-1 text-xs text-amber-100/70 leading-snug">
                    Assim que a equipe aceitar o seu pedido, esta página atualiza automaticamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Aviso de iniciado — barra de progresso animada */}
          {isManualIniciado && (
            <div className="relative overflow-hidden rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/20 via-sky-500/10 to-blue-500/5 p-4 sm:p-5 shadow-lg shadow-cyan-900/20">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 ring-1 ring-cyan-400/40">
                  <Loader2 className="h-5 w-5 text-cyan-300 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-200">Pedido iniciado</span>
                    <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-cyan-50 leading-snug">
                    Sua recarga está sendo processada agora mesmo.
                  </p>
                  <p className="mt-1 text-xs text-cyan-100/70 leading-snug">
                    Acompanhe o progresso abaixo. Esta página atualiza automaticamente ao concluir.
                  </p>
                  <div className="mt-3">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-cyan-950/60 ring-1 ring-cyan-400/20">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 shadow-[0_0_12px_rgba(34,211,238,0.6)] transition-[width] duration-700 ease-out"
                        style={{ width: `${iniciadoProgress}%` }}
                      >
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] font-mono text-cyan-200/70">
                      <span>Processando…</span>
                      <span>{Math.round(iniciadoProgress)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Aviso de pedido finalizado — celebração animada */}
          {isManualDone && (
            <div className="relative overflow-hidden rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 via-green-500/10 to-teal-500/5 p-4 sm:p-5 shadow-lg shadow-emerald-900/20 animate-fade-in">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/30 blur-2xl animate-pulse" />
              <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-teal-400/20 blur-2xl animate-pulse" />
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="relative flex items-start gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-400/50">
                  <CheckCircle2 className="h-6 w-6 text-emerald-300 animate-scale-in" />
                  <span className="absolute inset-0 rounded-xl ring-2 ring-emerald-400/40 animate-ping" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Pedido finalizado</span>
                    <PartyPopper className="h-3.5 w-3.5 text-emerald-300 animate-pulse" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-emerald-50 leading-snug">
                    Sua recarga foi entregue com sucesso! 🎉
                  </p>
                  <p className="mt-1 text-xs text-emerald-100/70 leading-snug">
                    Os créditos já estão disponíveis no seu workspace. Bom trabalho!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Card principal */}
          {isManualFailed && (
            <div className="relative overflow-hidden rounded-2xl border border-rose-400/40 bg-gradient-to-br from-rose-500/20 via-red-500/10 to-rose-500/5 p-5 sm:p-6 shadow-xl shadow-rose-900/30 animate-fade-in">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 ring-1 ring-rose-400/50">
                  <AlertCircle className="h-6 w-6 text-rose-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-200">Pedido sem sucesso</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-rose-50 leading-snug">
                    Não foi possível concluir esta recarga.
                  </p>
                  <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-950/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300/80">Mensagem do gerente</div>
                    <p className="mt-1 text-sm text-rose-50 leading-snug whitespace-pre-wrap break-words">
                      {order.managerNotes?.trim() || order.errorMessage?.trim() || "O gerente não deixou observações. Entre em contato com o suporte para mais detalhes."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => { setRefreshing(true); loadOrder(false); }}
                    disabled={refreshing}
                    className="mt-3 w-full border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                  >
                    {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Atualizar status
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!isManualFailed && (
          <div className="rounded-2xl p-[1.5px] bg-gradient-to-br from-amber-400/50 via-orange-400/20 to-amber-400/50 shadow-2xl shadow-amber-900/30">
            <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl p-5 sm:p-6 space-y-5">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" />

              <div className="relative flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  Pedido #{shortId}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border",
                    isManualDone
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : isManualFailed
                      ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                      : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                  )}
                >
                  {isManualDone ? <CheckCircle2 className="h-3 w-3" /> : isManualFailed ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                  {order.statusLabel ?? mStatus}
                </span>
              </div>

              {/* Stages */}
              <div className="relative space-y-3">
                {manualStages.map((s, idx) => (
                  <div key={s.key} className="flex items-start gap-3">
                    <div className="relative flex flex-col items-center">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all",
                          s.done
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                            : s.active
                            ? "border-amber-400 bg-amber-500/20 text-amber-300"
                            : "border-white/10 bg-white/5 text-zinc-500"
                        )}
                      >
                        {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                      </div>
                      {idx < manualStages.length - 1 && (
                        <div className={cn("w-0.5 h-8 mt-1", s.done ? "bg-emerald-500/60" : "bg-white/10")} />
                      )}
                    </div>
                    <div className="flex-1 pt-1.5 pb-4">
                      <div className={cn("text-sm font-semibold", s.done ? "text-emerald-200" : s.active ? "text-amber-100" : "text-zinc-400")}>
                        {s.label}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Card de configuração — Passo 2 (cliente envia nome do workspace) */}
              {isManualAceito && (() => {
                const hasWorkspace = Boolean(order.workspaceName) || workspaceSaved;
                const collapsed = hasWorkspace && !editingWorkspace;
                if (collapsed) {
                  return (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                        <div className="min-w-0 text-xs text-emerald-100/90 truncate">
                          Workspace: <span className="font-semibold text-emerald-200">{order.workspaceName}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceInput(order.workspaceName ?? "");
                          setEditingWorkspace(true);
                        }}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline whitespace-nowrap"
                      >
                        Trocar workspace
                      </button>
                    </div>
                  );
                }
                return (
                <div className="relative overflow-hidden rounded-xl border border-blue-400/40 bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-transparent p-4 sm:p-5">
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />
                  <div className="relative space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">Configuração</div>
                        <div className="text-sm font-bold text-white">Informe o nome do seu workspace</div>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 leading-snug">
                      Para concluir a configuração, digite o nome exato do workspace no Lovable onde os créditos devem ser entregues.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={workspaceInput}
                        onChange={(e) => setWorkspaceInput(e.target.value)}
                        placeholder={order.workspaceName ?? "Ex: meu-workspace"}
                        disabled={submittingWorkspace}
                        className="bg-zinc-900/60 border-white/10 text-white placeholder:text-zinc-500"
                      />
                      <Button
                        onClick={() => {
                          if (!workspaceInput.trim()) {
                            toast.error("Informe o nome do workspace");
                            return;
                          }
                          setConfirmWorkspaceOpen(true);
                        }}
                        disabled={submittingWorkspace || !workspaceInput.trim()}
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold whitespace-nowrap"
                      >
                        {submittingWorkspace ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                        Finalizar configuração
                      </Button>
                    </div>
                    {hasWorkspace && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Workspace registrado{order.workspaceName ? `: ${order.workspaceName}` : ""}. Você pode atualizar a qualquer momento até a equipe iniciar.
                      </div>
                    )}
                    {hasWorkspace && (
                      <button
                        type="button"
                        onClick={() => setEditingWorkspace(false)}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Resumo */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Créditos</div>
                  <div className="text-base font-bold text-white mt-0.5">{totalCredits.toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Valor</div>
                  <div className="text-base font-bold text-white mt-0.5">{fmtBRL(order.precoCentavos, order.precoReais)}</div>
                </div>
              </div>

              {order.errorMessage && (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {order.errorMessage}
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => { setRefreshing(true); loadOrder(false); }}
                disabled={refreshing}
                className="w-full border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
              >
                {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Atualizar status
              </Button>
            </div>
          </div>

          <p className="text-center text-[11px] text-zinc-500">
            Esta página atualiza automaticamente em tempo real.
          </p>
        </div>

        <Dialog open={confirmWorkspaceOpen} onOpenChange={(o) => !submittingWorkspace && setConfirmWorkspaceOpen(o)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar workspace</DialogTitle>
              <DialogDescription>
                Confirme se o nome do workspace está exatamente como aparece no Lovable. Os créditos serão entregues nesse workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-100 break-all">
              {workspaceInput.trim() || "—"}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmWorkspaceOpen(false)}
                disabled={submittingWorkspace}
              >
                Revisar
              </Button>
              <Button
                onClick={submitWorkspace}
                disabled={submittingWorkspace}
                className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold"
              >
                {submittingWorkspace ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-zinc-100 px-3 sm:px-4 py-4 sm:py-8">
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(168,85,247,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(168,85,247,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at top, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-2xl space-y-4">
        {/* Aviso de lentidão do provedor */}
        {providerAlert?.enabled && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/5 p-4 shadow-lg shadow-amber-900/20">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 ring-1 ring-amber-400/40">
                <AlertCircle className="h-5 w-5 text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Aviso do provedor</span>
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                </div>
                <p className="mt-1 text-sm font-medium text-amber-50 leading-snug">
                  {providerAlert.message || "Estamos com lentidão no provedor. Sua recargas pode demorar mais que o normal."}
                </p>
                {providerAlert.eta_minutes && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Tempo estimado: até {providerAlert.eta_minutes} min
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Título principal */}
        <div className="text-center space-y-1.5 pt-1 px-2">
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight text-balance">
            Aqui está o seu pedido de{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent whitespace-nowrap">
              {totalCredits > 0 ? `${totalCredits.toLocaleString("pt-BR")} recargas` : "recargas"}
            </span>
          </h1>
          <p className="text-[11px] sm:text-sm text-zinc-400">
            Acompanhe cada etapa em tempo real abaixo
          </p>
        </div>

        {/* Header compacto + Stepper SEMPRE visível */}
        <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-violet-400/60 via-fuchsia-400/30 to-indigo-400/60 shadow-2xl shadow-violet-900/40">
          <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-5">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

            <div className="relative flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                Pedido #{shortId}
              </div>
              {totalCredits > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-200">
                  <Zap className="h-3 w-3" />
                  {"\n"}{totalCredits} recargas
                </span>
              )}
            </div>

            {/* Stepper visual com 3 passos */}
            <div className="relative mt-4 flex items-start">
              {STEPS_META.map((s, idx) => {
                const Icon = s.icon;
                const done = isCancelled ? false : idx < currentStep || status === "sucesso";
                const active = !isCancelled && idx === currentStep && status !== "sucesso";
                return (
                  <div key={s.key} className="contents">
                    <div className="flex w-20 sm:w-28 shrink-0 flex-col items-center">
                      <div className="relative">
                        {active && (
                          <div className={cn("absolute inset-0 animate-ping rounded-2xl", `bg-gradient-to-br ${s.color} opacity-40`)} />
                        )}
                        <div
                          className={cn(
                            "relative flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-all duration-500 text-white",
                            done
                              ? "border-emerald-400 bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/40"
                              : active
                              ? cn("border-white/20 bg-gradient-to-br shadow-lg scale-110", s.color, s.glow)
                              : "border-white/10 bg-white/5 text-zinc-500"
                          )}
                        >
                          {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                        </div>
                        <div className={cn(
                          "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-zinc-950",
                          done ? "bg-emerald-500 text-white" : active ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-500"
                        )}>
                          {idx + 1}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "mt-2 text-[10px] sm:text-[11px] font-semibold text-center leading-tight px-1",
                          done ? "text-emerald-300" : active ? s.text : "text-zinc-500"
                        )}
                      >
                        {s.short}
                      </span>
                    </div>
                    {idx < STEPS_META.length - 1 && (
                      <div className="flex-1 mt-6 px-1">
                        <div
                          className={cn(
                            "h-0.5 w-full rounded-full transition-all duration-700",
                            idx < currentStep || status === "sucesso"
                              ? "bg-gradient-to-r from-emerald-400 to-emerald-500/30"
                              : "bg-white/10"
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TELA dinâmica — só uma por vez */}
        {isCancelled ? (
          <CancelledScreen status={status} message={order.mensagemBot} cancelar={order.cancelar} />
        ) : isInvalidInvite ? (
          <InvalidInviteScreen workspaceName={order.workspaceName} sent={sentCredits} total={totalCredits} />
        ) : currentStep === 0 && !order.emailConviteBot ? (
          <GeneratingInviteScreen />
        ) : currentStep === 0 ? (
          <Step1EditorScreen
            email={order.emailConviteBot}
            workspaceName={order.workspaceName}
            tutorialStep={tutorialStep}
            setTutorialStep={setTutorialStep}
            setLightbox={setLightbox}
            confirming={confirming}
            refreshing={refreshing}
            onConfirm={confirmInvite}
            onRefresh={() => {
              setRefreshing(true);
              loadOrder(true);
            }}
            copied={copied}
            onCopy={copy}
            lastAction={lastAction}
          />
        ) : currentStep === 1 ? (
          <Step2OwnerScreen
            email={order.emailConviteBot}
            workspaceName={order.workspaceName}
            tutorialStep={tutorialStep}
            setTutorialStep={setTutorialStep}
            setLightbox={setLightbox}
            confirming={confirming}
            refreshing={refreshing}
            onConfirm={confirmInvite}
            onRefresh={() => {
              setRefreshing(true);
              loadOrder(true);
            }}
            copied={copied}
            onCopy={copy}
            lastAction={lastAction}
          />
        ) : (
          <Step3DeliveryScreen
            order={order}
            status={status}
            sent={sentCredits}
            total={totalCredits}
          />
        )}

        {/* Footer */}
        <div className="pt-2 text-center text-[11px] text-zinc-500">
          Esta página atualiza automaticamente em tempo real
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
            onClick={() => setLightbox(null)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Tutorial"
            className="max-h-[90vh] max-w-[95vw] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/*  TELA 0 — Gerando email de convite                            */
/* ============================================================ */
function GeneratingInviteScreen() {
  const steps = [
    { icon: Mail, label: "Criando conta exclusiva do bot", done: true },
    { icon: ShieldCheck, label: "Configurando permissões seguras", done: true },
    { icon: Sparkles, label: "Gerando email único do convite", done: false, active: true },
    { icon: Rocket, label: "Liberando para envio", done: false },
  ];

  const tips = [
    {
      icon: ShieldCheck,
      title: "100% seguro",
      desc: "Cada pedido recebe um bot dedicado e isolado do seu workspace.",
    },
    {
      icon: Zap,
      title: "Entrega automática",
      desc: "Assim que você convidar o bot, os recargas são depositados em segundos.",
    },
    {
      icon: RefreshCw,
      title: "Atualização em tempo real",
      desc: "Esta página verifica o status sozinha — sem precisar recarregar.",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Card principal */}
      <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-violet-400/60 via-fuchsia-400/30 to-violet-400/60 shadow-2xl shadow-violet-900/40">
        <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/80 backdrop-blur-xl p-8 sm:p-10 text-center">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-2xl bg-violet-500/30" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/50">
              <Mail className="h-7 w-7 text-white animate-pulse" />
            </div>
          </div>
          <h2 className="mt-5 font-display text-lg sm:text-xl font-semibold text-white">
            Gerando email de convite…
          </h2>
          <p className="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
            Estamos preparando um email exclusivo para você nos convidar ao seu workspace.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[12px] font-semibold text-violet-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Tempo estimado: 3 a 5 minutos
          </div>
        </div>
      </div>

      {/* Card de progresso interno */}
      <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-violet-400/40 via-fuchsia-400/20 to-indigo-400/40 shadow-xl shadow-violet-900/30">
        <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/80 backdrop-blur-xl p-5 sm:p-6">
          <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/40 to-transparent" />

          <div className="relative flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">O que está acontecendo agora</h3>
                <p className="text-[10.5px] text-zinc-500 leading-tight">Acompanhe cada etapa em tempo real</p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ao vivo
            </span>
          </div>

          <ol className="relative space-y-1">
            {/* Linha vertical conectora */}
            <div className="pointer-events-none absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-400/60 via-violet-400/40 to-white/5" />

            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={i} className="relative flex items-start gap-3 py-1.5">
                  <div className="relative z-10 shrink-0">
                    {s.active && (
                      <div className="absolute inset-0 animate-ping rounded-xl bg-violet-500/40" />
                    )}
                    <div
                      className={cn(
                        "relative flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-500",
                        s.done
                          ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 text-emerald-300 shadow-md shadow-emerald-500/20"
                          : s.active
                          ? "border-violet-400/60 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-white shadow-lg shadow-violet-500/40 scale-105"
                          : "border-white/10 bg-white/[0.03] text-zinc-600"
                      )}
                    >
                      {s.done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : s.active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex-1 min-w-0 rounded-xl border px-3.5 py-2.5 transition-all duration-300",
                      s.done
                        ? "border-emerald-400/15 bg-emerald-500/[0.04]"
                        : s.active
                        ? "border-violet-400/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/5 shadow-md shadow-violet-500/10"
                        : "border-white/5 bg-white/[0.02]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[13px] sm:text-sm leading-tight",
                          s.done ? "text-zinc-300" : s.active ? "text-white font-semibold" : "text-zinc-500"
                        )}
                      >
                        {s.label}
                      </span>
                      {s.done && (
                        <span className="shrink-0 text-[10px] font-semibold text-emerald-300/80">
                          Concluído
                        </span>
                      )}
                      {s.active && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-200">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Em andamento
                        </span>
                      )}
                      {!s.done && !s.active && (
                        <span className="shrink-0 text-[10px] font-medium text-zinc-600">
                          Aguardando
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>


      {/* Cards de informação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tips.map((t, i) => {
          const Icon = t.icon;
          return (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-4 hover:border-violet-400/30 transition"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 ring-1 ring-violet-400/20 mb-2.5">
                <Icon className="h-4 w-4 text-violet-300" />
              </div>
              <h4 className="text-[13px] font-semibold text-zinc-200">{t.title}</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t.desc}</p>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        Não feche esta página. Ela será atualizada automaticamente quando o email estiver pronto.
      </p>
    </div>
  );
}


/* ============================================================ */
/*  TELA 1 — Convidar como EDITOR                               */
/* ============================================================ */
function Step1EditorScreen({
  email,
  workspaceName,
  tutorialStep,
  setTutorialStep,
  setLightbox,
  confirming,
  refreshing,
  onConfirm,
  onRefresh,
  copied,
  onCopy,
  lastAction,
}: {
  email?: string;
  workspaceName?: string;
  tutorialStep: number;
  setTutorialStep: (n: number | ((p: number) => number)) => void;
  setLightbox: (s: string | null) => void;
  confirming: boolean;
  refreshing: boolean;
  onConfirm: () => void;
  onRefresh: () => void;
  copied: boolean;
  onCopy: (s: string) => void;
  lastAction: ActionResult | null;
}) {
  const tutorial = TUTORIAL_EDITOR;
  return (
    <StepShell
      accentClass="from-amber-400/70 via-orange-400/50 to-amber-400/30"
      glowClass="shadow-amber-900/40"
      ringInner="from-amber-300/50"
      iconColor="from-amber-400 to-orange-500"
      iconGlow="shadow-amber-500/40"
      eyebrow="Passo 1 de 3 — Acesso ao workspace"
      title="Convide o nosso bot como Editor"
      subtitle={
        <>Para começar, adicione nosso bot no <b>seu workspace Lovable</b> com a permissão <b>Editor</b>. Ele vai precisar disso para preparar a transferência dos recargas.</>
      }
      icon={<Mail className="h-5 w-5" />}
      checklist={[
        "Copie o email do bot abaixo",
        "Abra o seu workspace no Lovable e clique em 'Invite members'",
        "Cole o email, escolha a permissão 'Editor' e envie o convite",
      ]}
      whyTitle="Por que precisamos desse acesso?"
      whyText="Como Editor, nosso bot consegue ser reconhecido pelo seu workspace. No próximo passo você vai promovê-lo para Owner — só assim ele pode transferir os recargas para você de forma automática e segura."
      nextTitle="O que acontece depois"
      nextSteps={[
        "Validamos o convite em segundos",
        "Você libera o bot como Owner (Passo 2)",
        "Os recargas chegam automaticamente no seu workspace",
      ]}
      email={email}
      copied={copied}
      onCopy={onCopy}
      tutorial={tutorial}
      tutorialStep={tutorialStep}
      setTutorialStep={setTutorialStep}
      setLightbox={setLightbox}
      ctaLabel="Já convidei como Editor"
      ctaIcon={<ShieldCheck className="mr-2 h-4 w-4" />}
      ctaGradient="from-amber-500 via-orange-500 to-amber-500"
      ctaGlow="shadow-amber-500/40"
      onConfirm={onConfirm}
      onRefresh={onRefresh}
      confirming={confirming}
      refreshing={refreshing}
      lastAction={lastAction}
    />
  );
}

/* ============================================================ */
/*  TELA 2 — Mudar para OWNER                                   */
/* ============================================================ */
function Step2OwnerScreen({
  email,
  workspaceName,
  tutorialStep,
  setTutorialStep,
  setLightbox,
  confirming,
  refreshing,
  onConfirm,
  onRefresh,
  copied,
  onCopy,
  lastAction,
}: {
  email?: string;
  workspaceName?: string;
  tutorialStep: number;
  setTutorialStep: (n: number | ((p: number) => number)) => void;
  setLightbox: (s: string | null) => void;
  confirming: boolean;
  refreshing: boolean;
  onConfirm: () => void;
  onRefresh: () => void;
  copied: boolean;
  onCopy: (s: string) => void;
  lastAction: ActionResult | null;
}) {
  return (
    <StepShell
      accentClass="from-violet-400/70 via-fuchsia-400/50 to-violet-400/30"
      glowClass="shadow-violet-900/50"
      ringInner="from-violet-300/50"
      iconColor="from-violet-500 to-fuchsia-500"
      iconGlow="shadow-violet-500/50"
      eyebrow="Passo 2 de 3 — Transferência segura"
      title="Promova o bot para Owner"
      subtitle={
        <>Quase lá! Agora promova nosso bot a <b>Owner</b> do workspace. Esse é o nível necessário para realizar a recargas dos recargas automaticamente.</>
      }
      icon={<Crown className="h-5 w-5" />}
      checklist={[
        "Volte em 'Members' do workspace no Lovable",
        "Localize o email do bot que você convidou no Passo 1",
        "Mude o papel de 'Editor' para 'Owner' e confirme a transferência",
      ]}
      whyTitle="Por que Owner e não Editor?"
      whyText="Apenas Owners têm permissão para realizar operações de recarga dentro do Lovable. Sem essa elevação, o bot não consegue concluir a entrega. Você pode reverter o papel a qualquer momento depois da recargas."
      nextTitle="Logo após confirmar"
      nextSteps={[
        "Verificamos automaticamente a permissão de Owner",
        "A entrega dos recargas começa em segundos",
        "Você acompanha tudo aqui em tempo real",
      ]}
      email={email}
      copied={copied}
      onCopy={onCopy}
      emailLabel="Email do bot (mesmo do passo anterior)"
      tutorial={TUTORIAL_OWNER}
      tutorialStep={tutorialStep}
      setTutorialStep={setTutorialStep}
      setLightbox={setLightbox}
      ctaLabel="Já promovi para Owner"
      ctaIcon={<Crown className="mr-2 h-4 w-4" />}
      ctaGradient="from-violet-600 via-fuchsia-600 to-violet-600"
      ctaGlow="shadow-violet-500/50"
      onConfirm={onConfirm}
      onRefresh={onRefresh}
      confirming={confirming}
      refreshing={refreshing}
      lastAction={lastAction}
    />
  );
}

/* ============================================================ */
/*  TELA 3 — Entrega automática                                 */
/* ============================================================ */
function Step3DeliveryScreen({
  order,
  status,
  sent,
  total,
}: {
  order: OrderData;
  status: string;
  sent: number;
  total: number;
}) {
  const isDone = status === "sucesso";
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : isDone ? 100 : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Card hero entrega */}
      <div
        className={cn(
          "relative rounded-2xl p-[1.5px] shadow-2xl",
          isDone
            ? "bg-gradient-to-br from-emerald-400/70 via-teal-400/50 to-emerald-400/30 shadow-emerald-900/40"
            : "bg-gradient-to-br from-emerald-400/60 via-violet-400/30 to-emerald-400/30 shadow-emerald-900/30"
        )}
      >
        <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl p-6 text-center">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-teal-500/15 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent" />

          <div className="relative">
            <div className="mx-auto relative w-fit">
              {!isDone && <div className="absolute inset-0 animate-ping rounded-2xl bg-emerald-400/30" />}
              <div
                className={cn(
                  "relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-xl ring-1 ring-white/20",
                  isDone
                    ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/50"
                    : "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/40"
                )}
              >
                {isDone ? <PartyPopper className="h-7 w-7" /> : <Rocket className="h-7 w-7 animate-pulse" />}
              </div>
            </div>

            <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              Passo 3 de 3 — {isDone ? "Concluído" : "Em andamento"}
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
              {isDone ? "Recargas concluída! 🎉" : "Enviando seus recargas…"}
            </h2>
            <p className="mt-2 text-sm text-zinc-300 max-w-md mx-auto">
              {isDone
                ? "Tudo pronto. Seus recargas já estão disponíveis no workspace."
                : "Nossos servidores estão transferindo os recargas automaticamente. Pode levar alguns instantes."}
            </p>

            {/* Contador animado de recargas */}
            <div className="mt-5 mx-auto max-w-sm">
              <div className="flex items-baseline justify-center gap-2">
                <span
                  className={cn(
                    "font-display text-5xl font-bold tabular-nums tracking-tight bg-gradient-to-br bg-clip-text text-transparent",
                    isDone
                      ? "from-white via-emerald-200 to-teal-300"
                      : "from-white via-emerald-200 to-teal-300"
                  )}
                >
                  {sent}
                </span>
                <span className="text-2xl font-semibold text-zinc-500">/ {total}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-400">recargas entregues</div>

              <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                <div
                  className={cn(
                    "relative h-full rounded-full overflow-hidden transition-all duration-700 ease-out bg-gradient-to-r",
                    isDone
                      ? "from-emerald-400 to-teal-400"
                      : "from-emerald-500 via-teal-500 to-emerald-500 bg-[length:200%_100%] animate-gradient-shift shadow-[0_0_20px_rgba(16,185,129,0.6)]"
                  )}
                  style={{ width: `${pct}%` }}
                >
                  {!isDone && (
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent animate-shimmer" />
                  )}
                </div>
              </div>

              {!isDone && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">
                  <Loader2 className="h-3 w-3 animate-spin text-emerald-300" />
                  Você não precisa fazer nada — apenas aguardar
                </div>
              )}
            </div>

            {order.workspaceName && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-400">
                <Sparkles className="h-3 w-3 text-emerald-300" />
                Workspace: <span className="font-mono text-zinc-200">{order.workspaceName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Balanço (transparência) */}
      <BalanceCard order={order} />
    </div>
  );
}

/* ============================================================ */
/*  TELA — CANCELADO / FALHA                                    */
/* ============================================================ */
function CancelledScreen({ status, message, cancelar }: { status: string; message?: string; cancelar?: boolean }) {
  const isPending = cancelar === true && status !== "cancelado" && status !== "reembolsado" && status !== "falha" && status !== "queimado";
  const label =
    status === "reembolsado" ? "reembolsado"
    : status === "queimado" ? "com problema no workspace"
    : status === "falha" ? "com falha"
    : isPending ? "em cancelamento"
    : "cancelado";
  return (
    <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-rose-400/60 via-red-400/40 to-rose-400/20 shadow-2xl shadow-rose-900/40 animate-fade-in">
      <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl p-6 text-center">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/40 ring-1 ring-white/20">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
            Pedido {label}
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            {isPending ? "Cancelamento em processamento" : "Não foi possível concluir a recargas"}
          </h2>
          {message && (
            <p className="mt-3 text-sm text-zinc-300 leading-relaxed max-w-md mx-auto break-words">
              {message}
            </p>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            Entre em contato com quem te enviou este link para regularizar.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  InvalidInviteScreen — link de convite não reconhecido       */
/* ============================================================ */
function InvalidInviteScreen({
  workspaceName,
  sent,
  total,
}: {
  workspaceName?: string;
  sent: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div className="relative rounded-2xl p-[1.5px] bg-gradient-to-br from-rose-400/60 via-red-400/40 to-rose-400/20 shadow-2xl shadow-rose-900/40 animate-fade-in">
      <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl p-5 sm:p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

        {/* Bloco do erro */}
        <div className="relative rounded-xl border border-rose-400/30 bg-gradient-to-br from-rose-500/10 to-rose-500/[0.02] p-4 sm:p-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/40 text-rose-300">
              <Link2Off className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              Link de convite inválido
            </h2>
            <p className="text-xs sm:text-sm text-rose-200/80">
              Solicite o cancelamento para receber os recargas em outra conta
            </p>
          </div>
          <p className="mt-3 text-xs sm:text-sm text-zinc-300 leading-relaxed text-center max-w-md mx-auto">
            O link de convite informado não é reconhecido como válido pelo sistema de
            indicação da Lovable. Para receber os recargas, solicite o cancelamento deste
            pedido e peça um novo para configurar outra conta.
          </p>
        </div>

        {/* Progresso */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider">
            <span className="font-semibold text-zinc-400">Recargas enviados</span>
            <span className="text-zinc-300">
              <span className="text-base font-extrabold text-white">{sent}</span>
              <span className="text-zinc-500"> / {total}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-red-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-500">
            Esta página é atualizada automaticamente conforme os recargas vão sendo
            adicionados.
          </p>
        </div>

        {/* Workspace */}
        {workspaceName && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Workspace
            </div>
            <div className="mt-0.5 text-sm font-bold text-white truncate">
              {workspaceName}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* ============================================================ */
function TrustChip({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-center backdrop-blur">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/90 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="text-[11px] font-bold text-white leading-none">{label}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 leading-none">{sub}</div>
    </div>
  );
}

/* ============================================================ */
/*  Componente compartilhado para Passos 1 e 2                  */
/* ============================================================ */
function StepShell(props: {
  accentClass: string;
  glowClass: string;
  ringInner: string;
  iconColor: string;
  iconGlow: string;
  eyebrow: string;
  title: string;
  subtitle: React.ReactNode;
  icon: React.ReactNode;
  checklist: string[];
  whyTitle?: string;
  whyText?: string;
  nextTitle?: string;
  nextSteps?: string[];
  email?: string;
  emailLabel?: string;
  copied: boolean;
  onCopy: (s: string) => void;
  tutorial: typeof TUTORIAL_EDITOR;
  tutorialStep: number;
  setTutorialStep: (n: number | ((p: number) => number)) => void;
  setLightbox: (s: string | null) => void;
  ctaLabel: string;
  ctaIcon: React.ReactNode;
  ctaGradient: string;
  ctaGlow: string;
  onConfirm: () => void;
  onRefresh: () => void;
  confirming: boolean;
  refreshing: boolean;
  lastAction: ActionResult | null;
}) {
  const t = props.tutorial[props.tutorialStep];

  return (
    <div className={cn("relative rounded-2xl p-[1.5px] shadow-2xl animate-fade-in bg-gradient-to-br", props.accentClass, props.glowClass)}>
      <div className="relative overflow-hidden rounded-[calc(1rem-1.5px)] bg-zinc-950/85 backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent via-white/40")}/>

        {/* Header */}
        <div className="relative flex flex-col items-center text-center gap-3 p-5 pb-3">
          <div className="relative shrink-0">
            <div className={cn("absolute inset-0 animate-ping rounded-xl bg-gradient-to-br opacity-30", props.iconColor)} />
            <div
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-lg ring-1 ring-white/20 bg-gradient-to-br",
                props.iconColor,
                props.iconGlow
              )}
            >
              {props.icon}
            </div>
          </div>
          <div className="min-w-0 w-full">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
              {props.eyebrow}
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-tight">
              {props.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-300 leading-snug max-w-md mx-auto">{props.subtitle}</p>
          </div>
        </div>

        {/* Checklist numerada */}
        <div className="relative px-4 sm:px-5 pb-2 space-y-2 max-w-md mx-auto">
          {props.checklist.map((text, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white ring-1 ring-white/20">
                {i + 1}
              </span>
              <span className="text-xs text-zinc-300 leading-relaxed text-left">{text}</span>
            </div>
          ))}
        </div>

        {/* Email destacado */}
        {props.email && (
          <div className="relative px-4 sm:px-5 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1.5 text-center">
              {props.emailLabel ?? "Email do bot"}
            </div>
            <button
              onClick={() => props.onCopy(props.email!)}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3 text-left transition-all hover:border-white/30 hover:bg-white/10"
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-md bg-gradient-to-br", props.iconColor, props.iconGlow)}>
                <Mail className="h-4 w-4" />
              </div>
              <code className="block min-w-0 flex-1 truncate font-mono text-sm font-bold text-white">
                {props.email}
              </code>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                  props.copied
                    ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                    : "border-white/20 bg-white/10 text-white group-hover:bg-white/20"
                )}
              >
                {props.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {props.copied ? "Copiado" : "Copiar"}
              </span>
            </button>
          </div>
        )}

        {/* "Por que isso?" + "O que vem depois" */}
        {(props.whyText || (props.nextSteps && props.nextSteps.length > 0)) && (
          <div className="relative px-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {props.whyText && (
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-3.5 backdrop-blur text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-md bg-gradient-to-br", props.iconColor)}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                    {props.whyTitle ?? "Por que isso?"}
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300 text-left">{props.whyText}</p>
              </div>
            )}
            {props.nextSteps && props.nextSteps.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-3.5 backdrop-blur text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-md bg-gradient-to-br", props.iconColor)}>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                    {props.nextTitle ?? "O que vem depois"}
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {props.nextSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-300 leading-snug">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Trust strip */}
        <div className="relative px-5 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <TrustChip icon={<ShieldCheck className="h-3.5 w-3.5" />} label="100% seguro" sub="Sem senhas" />
            <TrustChip icon={<Zap className="h-3.5 w-3.5" />} label="Automático" sub="Em segundos" />
            <TrustChip icon={<Sparkles className="h-3.5 w-3.5" />} label="Reversível" sub="Você no controle" />
          </div>
        </div>

        {/* Tutorial inline */}
        <div className="relative px-5 pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-1.5">
            Tutorial visual
          </div>
          <button
            onClick={() => props.setLightbox(t.img)}
            className="group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950/60"
            aria-label="Ver em tela cheia"
          >
            <img
              src={t.img}
              alt={t.title}
              className="w-full aspect-[16/9] object-cover object-left-top transition-transform group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/40 to-transparent" />
            <span className={cn("absolute top-2 left-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-white text-[11px] font-bold shadow-lg ring-1 ring-white/20 bg-gradient-to-br", props.iconColor)}>
              {props.tutorialStep + 1}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className="text-sm font-bold text-white">{t.title}</div>
              <p className="mt-0.5 text-[11px] text-zinc-300 leading-snug">{t.desc}</p>
            </div>
          </button>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={props.tutorialStep === 0}
              onClick={() => props.setTutorialStep((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 disabled:opacity-30 hover:bg-white/10"
            >
              <ChevronLeft className="h-3 w-3" /> Anterior
            </button>
            <div className="flex items-center gap-1">
              {props.tutorial.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => props.setTutorialStep(i)}
                  aria-label={`Passo ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === props.tutorialStep
                      ? cn("w-6 bg-gradient-to-r", props.iconColor)
                      : "w-1.5 bg-white/15 hover:bg-white/30"
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={props.tutorialStep === props.tutorial.length - 1}
              onClick={() => props.setTutorialStep((s) => Math.min(props.tutorial.length - 1, s + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 disabled:opacity-30 hover:bg-white/10"
            >
              Próximo <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Última verificação */}
        {props.lastAction && (
          <div className="relative px-5 pt-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs animate-fade-in backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Última verificação</span>
                <span className="font-mono font-semibold text-zinc-100">{props.lastAction.status ?? "—"}</span>
              </div>
              {props.lastAction.resultado?.motivo && (
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-zinc-400">Resultado</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-100">
                    {props.lastAction.resultado.motivo}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 p-5 pt-4">
          <Button
            onClick={props.onConfirm}
            disabled={props.confirming}
            size="lg"
            className={cn(
              "w-full font-bold text-white border-0 ring-1 ring-white/20 shadow-lg bg-gradient-to-r bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all",
              props.ctaGradient,
              props.ctaGlow
            )}
          >
            {props.confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando…
              </>
            ) : (
              <>
                {props.ctaIcon}
                {props.ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={props.onRefresh}
            disabled={props.refreshing}
            title="Atualizar status"
            className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={cn("h-4 w-4", props.refreshing && "animate-spin")} />
            <span className="ml-2 sm:hidden">Atualizar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Card de balanço                                             */
/* ============================================================ */
function BalanceCard({ order }: { order: OrderData }) {
  const cg = order.creditsGranted;
  const cu = order.creditsUsed;
  const cge = order.creditsGrantedEnd;
  const cue = order.creditsUsedEnd;
  const enviados = order.creditosEnviados ?? 0;
  const hasAny = cg != null || cu != null || cge != null || cue != null || enviados > 0;
  if (!hasAny) return null;

  const fmtNum = (v: number | null | undefined) => {
    if (v == null) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };
  const dispIni = cg != null && cu != null ? Number(cg) - Number(cu) : null;
  const dispFim = cge != null && cue != null ? Number(cge) - Number(cue) : null;
  const recarregados =
    cge != null && cg != null && cue != null && cu != null
      ? Number(cge) - Number(cg) + (Number(cue) - Number(cu))
      : null;

  const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", accent ? "text-violet-300 font-bold" : "text-zinc-100")}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="relative rounded-3xl p-[1px] bg-gradient-to-br from-violet-500/40 via-fuchsia-500/20 to-violet-500/40">
      <div className="rounded-[calc(1.5rem-1px)] bg-zinc-950/70 backdrop-blur-xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 ring-1 ring-white/20">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              Transparência
            </div>
            <h4 className="font-display text-sm font-bold text-white">Balanço da Recargas</h4>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
              Antes da Recargas
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1 divide-y divide-white/5">
              <Row label="Recargas iniciais" value={fmtNum(cg)} />
              <Row label="Consumo inicial" value={fmtNum(cu)} />
              <Row label="Recargas disponíveis" value={fmtNum(dispIni)} />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
              Após a Recargas
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1 divide-y divide-white/5">
              <Row label="Recargas finais" value={fmtNum(cge)} />
              <Row label="Consumo final" value={fmtNum(cue)} />
              <Row label="Recargas disponíveis" value={fmtNum(dispFim)} />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
              Resumo
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 px-3 py-1 divide-y divide-white/5">
              <Row label="Recargas enviados" value={fmtNum(enviados)} accent />
              <Row label="Recargas recarregados" value={fmtNum(recarregados)} accent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

