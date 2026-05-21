import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import {
  Loader2,
  Copy,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Coins,
  ShoppingCart,
  ExternalLink,
  Zap,
  Rocket,
  Crown,
  Gem,
  Flame,
  Mail,
  RefreshCw,
  ShieldCheck,
  Link2,
  List,
} from "lucide-react";
import { toast } from "sonner";

type Quote = {
  creditos?: number;
  precoReais?: string;
  precoCentavos?: number;
  saldoSuficiente?: boolean;
  precoUnitarioCentavos?: number;
};

type CreatedOrder = {
  id?: string;
  pedidoId?: string;
  linkCliente?: string;
  status?: string;
  precoReais?: string;
  precoCentavos?: number;
  valorReais?: string;
  valorCentavos?: number;
  creditos?: number;
  emailConviteBot?: string;
  tipoEntrega?: string;
  workspaceId?: string;
  workspaceName?: string;
  creditosEnviados?: number;
  etapaProcessamento?: number;
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

type LocalOrder = {
  id: string;
  pedido_id: string;
  creditos: number;
  preco_cents: number | null;
  status: string;
  email_convite_bot: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  creditos_enviados: number | null;
  etapa_processamento: number | null;
  created_at: string;
};

type PackDef = {
  amount: number;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClass?: string;
  gradient: string;
};

const STEP = 20;

const PACKS: PackDef[] = [
  {
    amount: 20,
    label: "20 recargas",
    short: "Mínimo",
    icon: Coins,
    badge: "Início",
    badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  {
    amount: 100,
    label: "100 recargas",
    short: "Pequeno",
    icon: Zap,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
  {
    amount: 200,
    label: "200 recargas",
    short: "Médio",
    icon: Rocket,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
  },
  {
    amount: 500,
    label: "500 recargas",
    short: "Grande",
    icon: Gem,
    badge: "Popular",
    badgeClass: "bg-primary/15 text-primary border-primary/30",
    gradient: "from-primary/25 via-primary/5 to-transparent",
  },
  {
    amount: 1000,
    label: "1000 recargas",
    short: "Enterprise",
    icon: Crown,
    badge: "Top",
    badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    gradient: "from-amber-500/25 via-amber-500/5 to-transparent",
  },
  {
    amount: 2000,
    label: "2000 recargas",
    short: "Mega",
    icon: Flame,
    badge: "Pro",
    badgeClass: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    gradient: "from-rose-500/25 via-rose-500/5 to-transparent",
  },
];

const parseValor = (q: Quote | CreatedOrder | null | undefined): number | null => {
  if (!q) return null;
  const cents = (q as any).precoCentavos ?? (q as any).valorCentavos;
  if (typeof cents === "number") return cents / 100;
  const raw = (q as any).precoReais ?? (q as any).valorReais;
  if (raw == null) return null;
  const n = Number(String(raw));
  return isNaN(n) ? null : n;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aguardando: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  configurando: { label: "Configurando", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  recarregando: { label: "Recarregando", cls: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  sucesso: { label: "Sucesso", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  falha: { label: "Falha", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
};

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GerenteGeracaoManualCreditos() {
  const [credits, setCredits] = useState<number>(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
  const [lastAction, setLastAction] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [localOrders, setLocalOrders] = useState<LocalOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const call = async (
    action: string,
    opts?: { method?: "GET" | "POST" | "PUT"; body?: any; query?: Record<string, string> }
  ) => {
    const qs = new URLSearchParams({ action, ...(opts?.query || {}) }).toString();
    const { data, error, skipped } = await invokeAuthenticatedFunction(`lovable-credits-api?${qs}`, {
      method: opts?.method ?? "GET",
      body: opts?.body,
    });
    if (skipped) throw new Error("Sessão expirada");
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Erro");
    return data;
  };

  const loadLocalOrders = async () => {
    setLoadingOrders(true);
    try {
      const r = await call("my_orders");
      const list = (r?.data ?? []) as LocalOrder[];
      setLocalOrders(list);
    } catch {
      // silently fail for history
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadBalance = async () => {
    try {
      const b = await call("balance");
      const d = b?.data ?? b;
      const saldo =
        typeof d?.saldoCentavos === "number"
          ? d.saldoCentavos / 100
          : d?.saldoReais != null
          ? Number(String(d.saldoReais))
          : null;
      setBalance(saldo != null && !isNaN(saldo) ? saldo : null);
      setConfigured(true);
    } catch (e: any) {
      setBalance(null);
      if (String(e?.message || "").toLowerCase().includes("not configured")) {
        setConfigured(false);
      } else {
        setConfigured(true);
      }
    }
  };

  useEffect(() => {
    loadBalance();
    loadLocalOrders();
  }, []);

  const fetchQuote = async (n: number) => {
    if (!n || n < STEP || n % STEP !== 0) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    try {
      const q = await call("quote", { query: { credits: String(n) } });
      const d = q?.data ?? q;
      setQuote({
        creditos: d?.creditos ?? n,
        precoReais: d?.precoReais,
        precoCentavos: d?.precoCentavos,
        saldoSuficiente: d?.saldoSuficiente,
        precoUnitarioCentavos: d?.precoUnitarioCentavos,
      });
      if (typeof d?.saldoAtualCentavos === "number") {
        setBalance(d.saldoAtualCentavos / 100);
      } else if (d?.saldoAtualReais != null) {
        const s = Number(String(d.saldoAtualReais));
        if (!isNaN(s)) setBalance(s);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Falha no orçamento");
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchQuote(credits), 400);
    return () => clearTimeout(t);
  }, [credits]);

  const createOrder = async () => {
    if (!credits || credits < STEP || credits % STEP !== 0) {
      toast.error(`Quantidade deve ser múltiplo de ${STEP}`);
      return;
    }
    setCreating(true);
    setLastOrder(null);
    setLastAction(null);
    try {
      const r = await call("create_order", { method: "POST", body: { creditos: credits } });
      const d = r?.data ?? r;
      const orderId: string | undefined = d?.id ?? d?.pedidoId;
      let merged: CreatedOrder = d;
      if (orderId) {
        try {
          const t = await call("define_delivery", {
            method: "PUT",
            query: { id: orderId },
            body: { tipo_entrega: "workspace_proprio" },
          });
          const td = t?.data ?? t;
          merged = { ...d, ...td, id: orderId };
        } catch (e: any) {
          toast.error(`Pedido criado, mas falhou ao definir entrega: ${e.message ?? ""}`);
        }
      }
      setLastOrder(merged);
      toast.success("Pedido criado · Workspace Próprio");
      loadBalance();
      loadLocalOrders();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar pedido");
    } finally {
      setCreating(false);
    }
  };

  const confirmInvite = async () => {
    const orderId = lastOrder?.id ?? lastOrder?.pedidoId;
    if (!orderId) return;
    setConfirming(true);
    setLastAction(null);
    try {
      const r = await call("confirm_invite", { method: "POST", query: { id: orderId } });
      const d = r?.data ?? r;
      const acaoId: string | undefined = d?.acaoId ?? d?.id;
      if (!acaoId) throw new Error("Sem acaoId na resposta");
      // poll ação
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const a = await call("action_status", { query: { id: orderId, acao_id: acaoId } });
        const ad = (a?.data ?? a) as ActionResult;
        setLastAction(ad);
        if (ad?.status === "finalizada") break;
      }
      // refresh do pedido
      const o = await call("order_details", { query: { id: orderId } });
      const od = o?.data ?? o;
      setLastOrder((prev) => ({ ...(prev || {}), ...od, id: orderId }));
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao confirmar convite");
    } finally {
      setConfirming(false);
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

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const valorAtual = useMemo(() => parseValor(quote), [quote]);
  const valorPedido = useMemo(() => parseValor(lastOrder), [lastOrder]);
  const precoPorCredito = useMemo(
    () => (valorAtual != null && credits > 0 ? valorAtual / credits : null),
    [valorAtual, credits]
  );
  const saldoSuficiente =
    balance != null && valorAtual != null ? balance >= valorAtual : null;

  const selected = PACKS.find((p) => p.amount === credits);

  return (
    <PageContainer>
      <PageHeader
        title="Geração Manual"
        description="Compre recargas diretamente pelo painel via API do provedor."
      />

      {/* Hero */}
      <div className="mt-6 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card/80 to-card/40 p-6 backdrop-blur-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Recargas em segundos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha um pacote, confirme e a recargas é debitada do saldo do provedor.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-4 py-2.5">
            <Wallet className="h-4 w-4 text-primary" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo provedor</div>
              <div className="font-display text-sm font-bold">
                {balance != null ? fmtBRL(balance) : configured === false ? "—" : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {configured === false ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-muted-foreground animate-fade-in">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <span>
            Configure a API Key em <strong>Acompanhar Recargas → Configurações</strong> antes de gerar pedidos.
          </span>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Form */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
              <h3 className="font-display text-sm font-semibold">Escolha um pacote</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PACKS.map((p) => {
                const Icon = p.icon;
                const active = credits === p.amount;
                return (
                  <button
                    key={p.amount}
                    type="button"
                    onClick={() => setCredits(p.amount)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-lg",
                      active
                        ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                        : "border-border bg-background/40 hover:border-border/80"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                        p.gradient,
                        active ? "opacity-100" : "opacity-40 group-hover:opacity-70"
                      )}
                    />
                    <div className="relative flex items-start justify-between">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                          active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {p.badge && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", p.badgeClass)}>
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <div className="relative mt-3">
                      <div className="font-display text-sm font-semibold">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground">{p.short}</div>
                    </div>
                    {active && (
                      <CheckCircle2 className="absolute bottom-2 right-2 h-4 w-4 text-primary animate-scale-in" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">2</span>
              <h3 className="font-display text-sm font-semibold">Quantidade personalizada</h3>
            </div>

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label>Recargas (múltiplos de {STEP})</Label>
                <Input
                  type="number"
                  min={STEP}
                  step={STEP}
                  value={credits}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "0", 10) || 0;
                    setCredits(Math.max(STEP, Math.round(n / STEP) * STEP));
                  }}
                  className="text-lg font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Mínimo {STEP} recargas. O valor abaixo vem direto do provedor.
                </p>
              </div>

              {/* Total card */}
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total a pagar</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-2xl font-bold">
                        {quoting ? <Loader2 className="h-5 w-5 animate-spin" /> : fmtBRL(valorAtual)}
                      </span>
                      {precoPorCredito != null && (
                        <span className="text-[11px] text-muted-foreground">
                          ~ {fmtBRL(precoPorCredito)} / crédito
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recargas</div>
                    <div className="mt-1 font-display text-2xl font-bold text-primary">{credits}</div>
                  </div>
                </div>

                {balance != null && valorAtual != null && (
                  <div
                    className={cn(
                      "mt-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px]",
                      saldoSuficiente
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                        : "border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {saldoSuficiente ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    <span>
                      {saldoSuficiente
                        ? `Saldo suficiente. Restará ${fmtBRL(balance - valorAtual)}.`
                        : `Saldo insuficiente. Faltam ${fmtBRL(valorAtual - balance)}.`}
                    </span>
                  </div>
                )}
              </div>

              <Button
                onClick={createOrder}
                disabled={creating || !credits || quoting || saldoSuficiente === false}
                size="lg"
                className="relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando pedido...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Gerar pedido {selected ? `· ${selected.label}` : `· ${credits} recargas`}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Result panel */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Resultado</h3>
            </div>

            {lastOrder ? (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-semibold">
                    Pedido criado · {lastOrder.creditos ?? credits} recargas
                  </span>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      ID do pedido
                    </Label>
                    <div className="mt-1.5 group relative rounded-xl border border-border bg-background/70 p-3 transition-colors hover:border-primary/40">
                      <code className="block break-all pr-10 font-mono text-xs leading-relaxed">
                        {lastOrder.id ?? lastOrder.pedidoId}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copy(String(lastOrder.id ?? lastOrder.pedidoId ?? ""))}
                        className="absolute right-2 top-2 h-7 w-7"
                        title="Copiar"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border bg-background/50 p-2.5">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</div>
                      <div className="mt-0.5 font-display text-sm font-bold">{fmtBRL(valorPedido ?? valorAtual)}</div>
                    </div>
                    {lastOrder.status && (
                      <div className="rounded-lg border border-border bg-background/50 p-2.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
                        <div className="mt-0.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            STATUS_META[lastOrder.status]?.cls ?? "bg-muted text-muted-foreground border-border"
                          )}>
                            {STATUS_META[lastOrder.status]?.label ?? lastOrder.status}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Workspace Próprio: email do bot */}
                  {lastOrder.emailConviteBot && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                          Email do bot · convide no workspace
                        </span>
                      </div>
                      <div className="mt-2 group relative rounded-lg border border-border bg-background/70 p-2.5">
                        <code className="block break-all pr-9 font-mono text-xs">
                          {lastOrder.emailConviteBot}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copy(lastOrder.emailConviteBot!)}
                          className="absolute right-1.5 top-1.5 h-6 w-6"
                          title="Copiar email"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <ol className="mt-3 space-y-1 text-[11px] text-muted-foreground list-decimal list-inside">
                        <li>Cliente convida esse email no workspace (qualquer permissão)</li>
                        <li>Clique em <strong>Confirmar convite</strong> abaixo</li>
                        <li>Cliente promove o bot para <strong>Owner</strong></li>
                        <li>Confirme novamente até virar <code>confirmado</code></li>
                      </ol>

                      {lastAction && (
                        <div className="mt-3 rounded-md border border-border bg-background/60 p-2.5 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Status da ação</span>
                            <span className="font-mono font-semibold">{lastAction.status ?? "—"}</span>
                          </div>
                          {lastAction.resultado?.motivo && (
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-muted-foreground">Motivo</span>
                              <span className={cn(
                                "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                                lastAction.resultado.motivo === "confirmado"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                  : lastAction.resultado.motivo === "permissao_incorreta"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                                  : "border-rose-500/40 bg-rose-500/10 text-rose-500"
                              )}>
                                {lastAction.resultado.motivo}
                              </span>
                            </div>
                          )}
                          {lastAction.resultado?.workspace_nome && (
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-muted-foreground">Workspace</span>
                              <span className="font-mono">{lastAction.resultado.workspace_nome}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={confirmInvite}
                          disabled={confirming}
                          className="w-full"
                        >
                          {confirming ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Confirmar convite
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={refreshOrder}
                          disabled={refreshing}
                          className="w-full"
                        >
                          {refreshing ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Atualizar status
                        </Button>
                      </div>
                    </div>
                  )}

                  {(lastOrder.workspaceName || lastOrder.creditosEnviados != null) && (
                    <div className="grid grid-cols-2 gap-2">
                      {lastOrder.workspaceName && (
                        <div className="rounded-lg border border-border bg-background/50 p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Workspace</div>
                          <div className="mt-0.5 font-mono text-xs truncate">{lastOrder.workspaceName}</div>
                        </div>
                      )}
                      {lastOrder.creditosEnviados != null && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entregues</div>
                          <div className="mt-0.5 font-display text-sm font-bold text-emerald-500">
                            {lastOrder.creditosEnviados} recargas
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(lastOrder.id || lastOrder.pedidoId) && (() => {
                    const oid = lastOrder.id ?? lastOrder.pedidoId!;
                    const link = `${window.location.origin}/recargas/${oid}`;
                    return (
                      <div className="rounded-xl border border-border bg-background/50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                          Link público para o cliente
                        </div>
                        <div className="group relative rounded-lg border border-border bg-background p-2.5">
                          <code className="block break-all pr-9 font-mono text-xs">{link}</code>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => copy(link)}
                            className="absolute right-1.5 top-1.5 h-6 w-6"
                            title="Copiar link"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Abrir página do cliente <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Coins className="h-5 w-5 text-primary/70" />
                </div>
                <p className="mt-3 text-sm font-medium">Nenhum pedido ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Os pedidos gerados aparecem aqui com link do cliente.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <List className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Histórico de pedidos</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadLocalOrders}
              disabled={loadingOrders}
              className="ml-auto h-7 px-2"
            >
              {loadingOrders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {loadingOrders && localOrders.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : localOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">Nenhum pedido no histórico ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pedido</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recargas</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valor</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Data</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {localOrders.map((o) => {
                    const link = `${window.location.origin}/recargas/${o.pedido_id}`;
                    return (
                      <tr key={o.id} className="border-b border-border/60 transition-colors hover:bg-muted/20">
                        <td className="px-3 py-2.5">
                          <code className="font-mono text-[11px]">{o.pedido_id.slice(0, 12)}…</code>
                        </td>
                        <td className="px-3 py-2.5 font-medium">{o.creditos}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {o.preco_cents != null ? fmtBRL(o.preco_cents / 100) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            STATUS_META[o.status]?.cls ?? "bg-muted text-muted-foreground border-border"
                          )}>
                            {STATUS_META[o.status]?.label ?? o.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => copy(link)}
                              className="h-6 w-6"
                              title="Copiar link"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                              title="Abrir link"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
      )}
    </PageContainer>
  );
}
