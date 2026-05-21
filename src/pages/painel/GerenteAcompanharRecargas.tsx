import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet, Loader2, Copy, RefreshCw, Search, Coins, CheckCircle2, Clock, XCircle,
  Filter, ArrowUpRight, Zap, Eye, ExternalLink, History as HistoryIcon, Hand, Send,
  Wrench, AlertTriangle, RotateCcw, ChevronDown, BarChart3, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import RefundSaleDialog, { type RefundSaleData } from "@/components/painel/RefundSaleDialog";

type Usage = {
  id: string;
  license_type: string;
  license_key: string;
  status: string;
  created_at: string;
  responsavel_email?: string | null;
  responsavel_nome?: string | null;
  price_cents?: number | null;
  refunded?: boolean;
  raw?: any;
};

type ManualOrder = {
  id: string;
  provider_pedido_id: string;
  credits: number;
  price_cents: number;
  status: string;
  created_at: string;
  updated_at?: string | null;
  tipo_entrega: string;
  workspace_name?: string | null;
  invite_status?: string | null;
  notes?: string | null;
  responsavel_nome?: string | null;
  responsavel_email?: string | null;
  raw?: any;
};

const TYPE_LABEL: Record<string, string> = {};

export default function GerenteAcompanharRecargas() {
  const [usage, setUsage] = useState<Usage[]>([]);
  const [manualOrders, setManualOrders] = useState<ManualOrder[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsData, setDetailsData] = useState<Usage | ManualOrder | null>(null);
  const [orderTab, setOrderTab] = useState<"manual" | "automatico">("manual");
  const [failOpen, setFailOpen] = useState(false);
  const [failTarget, setFailTarget] = useState<ManualOrder | null>(null);
  const [failReason, setFailReason] = useState<string>("");
  const [failCustom, setFailCustom] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"hoje" | "7d" | "14d" | "30d">("hoje");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant?: "default" | "destructive";
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundData, setRefundData] = useState<RefundSaleData | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const askConfirm = (data: {
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: "default" | "destructive";
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmData({
      title: data.title,
      description: data.description,
      confirmLabel: data.confirmLabel ?? "Confirmar",
      variant: data.variant,
      onConfirm: data.onConfirm,
    });
    setConfirmOpen(true);
  };

  const FAIL_REASONS = [
    "Cliente não aceitou o convite no workspace",
    "Workspace informado inválido ou inexistente",
    "Bot bloqueado ou limite de convites atingido",
    "Cliente solicitou cancelamento",
    "Pagamento estornado / chargeback",
    "Outro motivo (descrever abaixo)",
  ];

  const call = async (action: string, opts?: { method?: "GET" | "POST"; body?: any }) => {
    try {
      const { data, error } = await invokeAuthenticatedFunction(`lovable-credits-api?action=${action}`, {
        method: opts?.method ?? "GET",
        body: opts?.body,
      });
      if (error || data?.error) return null;
      return data;
    } catch {
      return null;
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const s = await call("admin-get-settings");
      if (!s?.configured) {
        setConfigured(false);
        setUsage([]);
        setSaldo(null);
        return;
      }
      setConfigured(true);
      const b = await call("balance");
      const v = b?.data?.saldoReais ?? b?.saldoReais ?? (b?.data?.saldoCentavos != null ? b.data.saldoCentavos / 100 : (b?.data?.saldo ?? b?.saldo ?? 0));
      setSaldo(Number(v) || 0);
      const u = await call("orders");
      const finalizedSet = new Set(["sucesso", "finalizado", "avaliado", "reembolsado", "queimado"]);
      const orders = (u?.data?.pedidos ?? u?.pedidos ?? []).map((p: any) => {
        let status = String(p.status ?? "—");
        // Se o link de convite é inválido (codigoConviteStatus = 2) ou o provedor marcou cancelar=true,
        // tratamos como cancelado no painel para casar com a visão do provedor.
        const inviteInvalid = Number(p.codigoConviteStatus) === 2;
        const flaggedCancel = p.cancelar === true;
        if ((inviteInvalid || flaggedCancel) && !finalizedSet.has(status.toLowerCase())) {
          status = "cancelado";
        }
        return {
          id: p.id ?? p.pedidoId ?? "",
          license_type: `Recargas (${p.creditos ?? "—"})`,
          license_key: p.linkCliente ?? p.id ?? p.pedidoId ?? "",
          status,
          created_at: p.criadoEm ?? p.dataCriacao ?? new Date().toISOString(),
          responsavel_email: p.responsavel_email ?? null,
          raw: p,
        };
      });
      // Enriquecer com responsável (revendedor) via reseller_credit_purchases
      const ids = orders.map((o: Usage) => o.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: purchases } = await supabase
          .from("reseller_credit_purchases")
          .select("provider_pedido_id, reseller_id, price_cents, status, resellers:reseller_id(display_name, user_id)")
          .in("provider_pedido_id", ids);
        const userIds = Array.from(new Set((purchases ?? []).map((p: any) => p.resellers?.user_id).filter(Boolean)));
        let emailMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, email").in("id", userIds);
          emailMap = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
        }
        const respMap = new Map<string, { nome: string | null; email: string | null }>();
        const priceMap = new Map<string, { price_cents: number | null; refunded: boolean }>();
        for (const p of (purchases ?? []) as any[]) {
          respMap.set(p.provider_pedido_id, {
            nome: p.resellers?.display_name ?? null,
            email: p.resellers?.user_id ? (emailMap.get(p.resellers.user_id) ?? null) : null,
          });
          priceMap.set(p.provider_pedido_id, {
            price_cents: p.price_cents ?? null,
            refunded: p.status === "estornado",
          });
        }
        for (const o of orders) {
          const r = respMap.get(o.id);
          if (r) {
            o.responsavel_nome = r.nome;
            o.responsavel_email = r.email;
          }
          const pr = priceMap.get(o.id);
          if (pr) {
            o.price_cents = pr.price_cents;
            o.refunded = pr.refunded;
          }
        }
      }
      setUsage(orders);
      await loadManualOrders();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const loadManualOrders = async () => {
    const { data: rows } = await supabase
      .from("reseller_credit_purchases")
      .select("id, provider_pedido_id, credits, price_cents, status, created_at, updated_at, tipo_entrega, provider_response, reseller_id, resellers:reseller_id(display_name, user_id)")
      .contains("provider_response", { manual: true } as any)
      .order("created_at", { ascending: false })
      .limit(500);
    const items = (rows ?? []) as any[];
    const userIds = Array.from(new Set(items.map((r) => r.resellers?.user_id).filter(Boolean)));
    let emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", userIds);
      emailMap = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
    }
    const pedidoIds = items.map((r) => r.provider_pedido_id).filter(Boolean);
    let metaMap = new Map<string, { workspace_name: string | null; invite_status: string | null; notes: string | null }>();
    if (pedidoIds.length > 0) {
      const { data: meta } = await supabase
        .from("manual_recharge_metadata")
        .select("provider_pedido_id, workspace_name, invite_status, notes")
        .in("provider_pedido_id", pedidoIds);
      metaMap = new Map((meta ?? []).map((m: any) => [m.provider_pedido_id, { workspace_name: m.workspace_name, invite_status: m.invite_status, notes: m.notes }]));
    }
    const mapped: ManualOrder[] = items.map((r) => {
      const meta = metaMap.get(r.provider_pedido_id);
      return {
        id: r.id,
        provider_pedido_id: r.provider_pedido_id,
        credits: r.credits,
        price_cents: r.price_cents,
        status: r.status ?? "manual_pendente",
        created_at: r.created_at,
        updated_at: r.updated_at,
        tipo_entrega: r.tipo_entrega,
        workspace_name: meta?.workspace_name ?? null,
        invite_status: meta?.invite_status ?? null,
        notes: meta?.notes ?? null,
        responsavel_nome: r.resellers?.display_name ?? null,
        responsavel_email: r.resellers?.user_id ? (emailMap.get(r.resellers.user_id) ?? null) : null,
        raw: r,
      };
    });
    setManualOrders(mapped);
  };

  const setManualStatus = async (
    m: ManualOrder,
    status: "manual_pendente" | "manual_aceito" | "manual_iniciado" | "manual_limite_atingido" | "manual_concluido" | "manual_sem_sucesso",
    extra?: { notes?: string | null; force?: boolean },
  ) => {
    // Garante a sequência: Pendente → Aceito → Iniciado → Concluído.
    // "Sem sucesso" pode ser acionado a partir de qualquer status não-final.
    const ORDER = ["manual_pendente", "manual_aceito", "manual_iniciado", "manual_limite_atingido", "manual_concluido"] as const;
    const current = (m.status || "manual_pendente") as string;
    const finalSet = new Set(["manual_concluido", "manual_entregue", "manual_sem_sucesso"]);
    if (!extra?.force && status !== "manual_sem_sucesso") {
      if (finalSet.has(current)) {
        toast.error("Pedido já finalizado.");
        return;
      }
      const ci = ORDER.indexOf(current as any);
      const ni = ORDER.indexOf(status as any);
      // permite avanço de 1 passo OU pular "limite atingido" indo direto de iniciado para concluído
      const okStep = ni === ci + 1;
      const okSkipLimite = current === "manual_iniciado" && status === "manual_concluido";
      if (ci < 0 || ni < 0 || (!okStep && !okSkipLimite)) {
        toast.error("Sequência inválida. Avance um passo por vez.");
        return;
      }
    } else if (!extra?.force && finalSet.has(current)) {
      toast.error("Pedido já finalizado.");
      return;
    }
    const inviteMap: Record<typeof status, string> = {
      manual_pendente: "pending",
      manual_aceito: "accepted",
      manual_iniciado: "started",
      manual_limite_atingido: "rate_limited",
      manual_concluido: "delivered",
      manual_sem_sucesso: "failed",
    };
    const { error: e1 } = await supabase
      .from("reseller_credit_purchases")
      .update({ status })
      .eq("id", m.id);
    const metaPatch: any = { invite_status: inviteMap[status] };
    if (extra && Object.prototype.hasOwnProperty.call(extra, "notes")) metaPatch.notes = extra.notes ?? null;
    const { error: e2 } = await supabase
      .from("manual_recharge_metadata")
      .update(metaPatch)
      .eq("provider_pedido_id", m.provider_pedido_id);
    if (e1 || e2) {
      toast.error("Falha ao atualizar o pedido");
      return;
    }
    toast.success("Pedido atualizado");
    await loadManualOrders();
  };

  useEffect(() => { loadAll(); }, []);

  // Atualiza pedidos manuais a cada 4s para refletir ações do cliente (ex.: envio do workspace) em tempo real
  useEffect(() => {
    const t = setInterval(() => { loadManualOrders(); }, 4000);
    return () => clearInterval(t);
  }, []);

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success("Copiado"); };

  const rangeStart = useMemo(() => {
    const d = new Date();
    if (timeRange === "hoje") {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const days = timeRange === "7d" ? 7 : timeRange === "14d" ? 14 : 30;
    d.setDate(d.getDate() - days);
    return d;
  }, [timeRange]);

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return !isNaN(t) && t >= rangeStart.getTime();
  };

  const usageInRange = useMemo(() => usage.filter((u) => inRange(u.created_at)), [usage, rangeStart]);
  const manualInRange = useMemo(() => manualOrders.filter((m) => inRange(m.created_at)), [manualOrders, rangeStart]);

  const stats = useMemo(() => {
    const sucessoSet = new Set(["sucesso", "finalizado", "avaliado"]);
    const pendingSet = new Set(["aguardando", "configurando", "recarregando", "entregando"]);
    const failSet = new Set(["falha", "queimado", "cancelado"]);
    return {
      total: usageInRange.length,
      ok: usageInRange.filter((u) => sucessoSet.has(u.status.toLowerCase())).length,
      pending: usageInRange.filter((u) => pendingSet.has(u.status.toLowerCase())).length,
      fail: usageInRange.filter((u) => failSet.has(u.status.toLowerCase())).length,
    };
  }, [usageInRange]);

  const filteredUsage = useMemo(() => {
    return usageInRange.filter((u) => {
      const matchStatus = statusFilter === "all" ? true : u.status.toLowerCase() === statusFilter;
      const q = search.trim().toLowerCase();
      const matchQ = !q || u.id.toLowerCase().includes(q) || u.license_type.toLowerCase().includes(q) || u.license_key.toLowerCase().includes(q) || (u.responsavel_nome ?? "").toLowerCase().includes(q) || (u.responsavel_email ?? "").toLowerCase().includes(q);
      return matchStatus && matchQ;
    });
  }, [usageInRange, search, statusFilter]);

  const STATUS_STYLES: Record<string, string> = {
    aguardando: "bg-amber-500/15 text-amber-500 border-amber-500/40",
    configurando: "bg-purple-500/15 text-purple-400 border-purple-500/40",
    recarregando: "bg-violet-500/15 text-violet-400 border-violet-500/40",
    entregando: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
    sucesso: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
    finalizado: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
    avaliado: "bg-blue-500/15 text-blue-400 border-blue-500/40",
    falha: "bg-red-500/15 text-red-500 border-red-500/40",
    queimado: "bg-orange-500/15 text-orange-500 border-orange-500/40",
    cancelado: "bg-rose-500/15 text-rose-500 border-rose-500/40",
    reembolsado: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  };

  const FILTER_OPTIONS = [
    { key: "all", label: "Todos", icon: Filter },
    { key: "aguardando", label: "Aguardando", icon: Clock },
    { key: "recarregando", label: "Recarregando", icon: Zap },
    { key: "sucesso", label: "Sucesso", icon: CheckCircle2 },
    { key: "falha", label: "Falha", icon: XCircle },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
              <BarChart3 className="h-3 w-3" /> Painel do provedor
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Acompanhar Recargas</h1>
            <p className="text-sm text-muted-foreground">Pedidos manuais e automáticos do provedor no período selecionado.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-background/60 p-0.5 backdrop-blur">
              {(["hoje", "7d", "14d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    timeRange === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r === "hoje" ? "Hoje" : r === "7d" ? "7 dias" : r === "14d" ? "14 dias" : "30 dias"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={loadAll} disabled={refreshing} className="bg-background/60 backdrop-blur">
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} /> Atualizar
            </Button>
          </div>
        </div>
      </div>

      {!configured && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <div className="font-medium text-amber-600 dark:text-amber-400">Provedor não configurado</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure a chave mestre em <strong>API Recargas</strong> para começar a receber pedidos.
          </p>
        </div>
      )}

      {configured && (
        <div className="mt-4 relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/80 to-card/40 p-6 backdrop-blur-sm">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-primary/40">
                <Wallet className="h-7 w-7 text-primary" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Saldo no provedor</div>
                <div className="mt-1 font-display text-4xl font-black tracking-tight">
                  {saldo != null ? `R$ ${Number(saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                <div className="mt-0.5 font-display text-lg font-bold">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-emerald-500/80">Sucesso</div>
                <div className="mt-0.5 font-display text-lg font-bold text-emerald-500">{stats.ok}</div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-amber-500/80">Pendentes</div>
                <div className="mt-0.5 font-display text-lg font-bold text-amber-500">{stats.pending}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs: Manual / Automático */}
      <div className="mt-5 inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
        <button
          onClick={() => setOrderTab("manual")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
            orderTab === "manual" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Hand className="h-3.5 w-3.5" /> Pedidos manuais
          <span className={cn("rounded-full px-1.5 text-[10px]", orderTab === "manual" ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground")}>{manualInRange.length}</span>
        </button>
        <button
          onClick={() => setOrderTab("automatico")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
            orderTab === "automatico" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="h-3.5 w-3.5" /> Pedidos automáticos
          <span className={cn("rounded-full px-1.5 text-[10px]", orderTab === "automatico" ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground")}>{usageInRange.length}</span>
        </button>
      </div>

      {orderTab === "automatico" && (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por ID, tipo, link..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = statusFilter === opt.key;
                const count = opt.key === "all" ? stats.total : usageInRange.filter((u) => u.status.toLowerCase() === opt.key).length;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStatusFilter(opt.key)}
                    className={cn(
                      "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                      active ? "border-primary/60 bg-primary/15 text-primary shadow-sm"
                        : "border-border bg-background/40 text-muted-foreground hover:border-border/80 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                    <span className={cn("ml-0.5 rounded-full px-1.5 text-[10px]", active ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground")}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
            {filteredUsage.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Coins className="h-6 w-6 text-primary/70" />
                </div>
                <p className="mt-3 text-sm font-medium">
                  {usage.length === 0 ? "Nenhum pedido registrado ainda." : "Nenhum pedido com esses filtros."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                      <th className="px-4 py-3 text-left font-semibold">Recargas</th>
                      <th className="px-4 py-3 text-left font-semibold">Link público</th>
                      <th className="px-4 py-3 text-left font-semibold">Responsável</th>
                      <th className="px-4 py-3 text-center font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Data</th>
                      <th className="px-4 py-3 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsage.map((u, i) => {
                      const s = u.status.toLowerCase();
                      const cls = STATUS_STYLES[s] || "bg-muted text-muted-foreground border-border";
                      const link = u.id ? `${window.location.origin}/recargas/${u.id}` : "";
                      return (
                        <tr key={u.id || i} className="group border-b border-border/40 last:border-0 transition-colors hover:bg-primary/5">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Coins className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <code className="font-mono text-[11px] font-semibold">{u.id ? u.id.slice(0, 8) : "—"}</code>
                                {u.id && (
                                  <button onClick={() => copy(u.id)} className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar ID">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{TYPE_LABEL[u.license_type] ?? u.license_type}</td>
                          <td className="px-4 py-3">
                            {u.id ? (
                              <div className="flex items-center gap-1.5">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="group/link inline-flex max-w-[280px] items-center gap-1.5 truncate rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 font-mono text-[11px] text-primary transition-colors hover:border-primary/40 hover:bg-primary/10">
                                  <span className="truncate">/recargas/{u.id.slice(0, 8)}…</span>
                                  <ArrowUpRight className="h-3 w-3 shrink-0 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
                                </a>
                                <button onClick={() => copy(link)} className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar link">
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {u.responsavel_nome || u.responsavel_email ? (
                              <div className="flex flex-col leading-tight">
                                {u.responsavel_nome && (
                                  <span className="text-[12px] font-medium text-foreground">{u.responsavel_nome}</span>
                                )}
                                {u.responsavel_email && (
                                  <span className="font-mono text-[10px] text-muted-foreground">{u.responsavel_email}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wide", cls)}>
                              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                            {new Date(u.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {u.status.toLowerCase() === "cancelado" && !u.refunded && (u.price_cents ?? 0) > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-1.5 sm:px-2 text-[10px] font-bold uppercase border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                                  title="Estornar venda"
                                  onClick={() => {
                                    setRefundData({
                                      tipo: "credits",
                                      provider_pedido_id: u.id,
                                      reseller_label: u.responsavel_nome || u.responsavel_email,
                                      price_cents: u.price_cents ?? 0,
                                      extra_info: u.license_type,
                                    });
                                    setRefundDialogOpen(true);
                                  }}
                                >
                                  <Undo2 className="h-3.5 w-3.5 sm:mr-1" />
                                  <span className="hidden sm:inline">Estornar</span>
                                </Button>
                              )}
                              {u.refunded && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400">
                                  <Undo2 className="h-2.5 w-2.5" /> Estornado
                                </span>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Detalhes" onClick={() => { setDetailsData(u); setDetailsOpen(true); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
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

      {orderTab === "manual" && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
          {manualInRange.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Hand className="h-6 w-6 text-primary/70" />
              </div>
              <p className="mt-3 text-sm font-medium">{manualOrders.length === 0 ? "Nenhum pedido manual registrado ainda." : "Nenhum pedido manual no período."}</p>
              <p className="mt-1 text-xs text-muted-foreground">Pedidos feitos no modo manual aparecerão aqui para entrega pela equipe.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                    <th className="px-4 py-3 text-left font-semibold">Recargas</th>
                    <th className="px-4 py-3 text-left font-semibold">Workspace</th>
                    <th className="px-4 py-3 text-left font-semibold">Responsável</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Data</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {manualInRange.map((m) => {
                    const s = (m.status || "").toLowerCase();
                    const STATUS_MAP: Record<string, { label: string; cls: string; Icon: any }> = {
                      manual_pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-500 border-amber-500/40", Icon: Clock },
                      manual_aceito: { label: "Aceito/config", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40", Icon: Hand },
                      manual_iniciado: { label: "Pedido Iniciado", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40", Icon: Wrench },
                      manual_limite_atingido: { label: "Limite atingido", cls: "bg-orange-500/15 text-orange-400 border-orange-500/40", Icon: Clock },
                      manual_concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40", Icon: CheckCircle2 },
                      manual_entregue: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40", Icon: CheckCircle2 },
                      manual_sem_sucesso: { label: "Sem sucesso", cls: "bg-red-500/15 text-red-500 border-red-500/40", Icon: AlertTriangle },
                    };
                    const meta = STATUS_MAP[s] ?? { label: m.status, cls: "bg-muted text-muted-foreground border-border", Icon: Clock };
                    const isDone = s === "manual_concluido" || s === "manual_entregue";
                    const isFail = s === "manual_sem_sucesso";
                    return (
                      <tr key={m.id} className="group border-b border-border/40 last:border-0 transition-colors hover:bg-primary/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Hand className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <code className="font-mono text-[11px] font-semibold">{m.provider_pedido_id.slice(0, 8)}</code>
                              <button onClick={() => copy(m.provider_pedido_id)} className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar ID">
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.credits} recargas</td>
                        <td className="px-4 py-3 text-xs">
                          {m.workspace_name ? (
                            <code className="inline-flex items-center rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">
                              {m.workspace_name}
                            </code>
                          ) : (
                            <span className="text-muted-foreground">— aguardando convite</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {m.responsavel_nome || m.responsavel_email ? (
                            <div className="flex flex-col leading-tight">
                              {m.responsavel_nome && <span className="text-[12px] font-medium text-foreground">{m.responsavel_nome}</span>}
                              {m.responsavel_email && <span className="font-mono text-[10px] text-muted-foreground">{m.responsavel_email}</span>}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn(
                              "inline-flex rounded-2xl border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wide",
                              s === "manual_limite_atingido" ? "flex-col items-center gap-1" : "items-center gap-1 rounded-full py-0.5",
                              meta.cls,
                            )}>
                              <span className="inline-flex items-center gap-1">
                                <meta.Icon className="h-3 w-3" />
                                {meta.label}
                              </span>
                              {s === "manual_limite_atingido" && (() => {
                                const startMs = m.updated_at ? Date.parse(m.updated_at) : Date.parse(m.created_at);
                                const endsAt = (isFinite(startMs) ? startMs : nowTick) + 24 * 60 * 60 * 1000;
                                const remaining = Math.max(0, endsAt - nowTick);
                                if (remaining <= 0) {
                                  return (
                                    <button
                                      onClick={() => askConfirm({
                                        title: "Continuar pedido?",
                                        description: `O pedido ${m.provider_pedido_id.slice(0,8)} voltará para Pedido Iniciado para retomada do envio.`,
                                        confirmLabel: "Continuar",
                                        onConfirm: () => setManualStatus(m, "manual_iniciado", { force: true }),
                                      })}
                                      className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/30"
                                    >
                                      Continuar
                                    </button>
                                  );
                                }
                                const hh = String(Math.floor(remaining / 3_600_000)).padStart(2, "0");
                                const mm = String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, "0");
                                const ss = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0");
                                return (
                                  <span className="rounded-full bg-orange-500/30 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-orange-100">
                                    {hh}:{mm}:{ss}
                                  </span>
                                );
                              })()}
                            </span>
                            {isFail && m.notes && (
                              <span className="max-w-[180px] truncate text-[10px] text-red-500/80" title={m.notes}>{m.notes}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {!isDone && !isFail && (
                              <>
                                {s === "manual_pendente" && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => askConfirm({
                                    title: "Aceitar pedido?",
                                    description: `O pedido ${m.provider_pedido_id.slice(0,8)} será marcado como Aceito/config e o cliente poderá informar o workspace.`,
                                    confirmLabel: "Aceitar",
                                    onConfirm: () => setManualStatus(m, "manual_aceito"),
                                  })}>
                                    <Hand className="mr-1 h-3 w-3" /> Aceitar
                                  </Button>
                                )}
                                {s === "manual_aceito" && (
                                  m.workspace_name ? (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => askConfirm({
                                      title: "Marcar como Iniciado?",
                                      description: `O pedido ${m.provider_pedido_id.slice(0,8)} entrará em Config/start.`,
                                      confirmLabel: "Iniciar",
                                      onConfirm: () => setManualStatus(m, "manual_iniciado"),
                                    })}>
                                      <Wrench className="mr-1 h-3 w-3" /> Iniciado
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" disabled className="h-7 px-2 text-xs opacity-70 cursor-not-allowed">
                                      <Clock className="mr-1 h-3 w-3" /> Pendente
                                    </Button>
                                  )
                                )}
                                {s === "manual_iniciado" && (
                                  <>
                                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600" title="Marcar Limite diário atingido" onClick={() => askConfirm({
                                    title: "Marcar Limite diário?",
                                    description: `O pedido ${m.provider_pedido_id.slice(0,8)} ficará em Limite atingido até o limite diário liberar.`,
                                    confirmLabel: "Marcar limite",
                                    onConfirm: () => setManualStatus(m, "manual_limite_atingido"),
                                  })}>
                                    <Clock className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => askConfirm({
                                    title: "Concluir pedido?",
                                    description: `Confirmar entrega do pedido ${m.provider_pedido_id.slice(0,8)}. Esta ação finaliza o pedido.`,
                                    confirmLabel: "Concluir",
                                    onConfirm: () => setManualStatus(m, "manual_concluido", { notes: null }),
                                  })}>
                                    <CheckCircle2 className="mr-1 h-3 w-3" /> Concluído
                                  </Button>
                                  </>
                                )}
                                {s === "manual_limite_atingido" && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => askConfirm({
                                    title: "Retomar pedido?",
                                    description: `O pedido ${m.provider_pedido_id.slice(0,8)} voltará para Pedido Iniciado para continuar o envio.`,
                                    confirmLabel: "Retomar",
                                    onConfirm: () => setManualStatus(m, "manual_iniciado", { force: true }),
                                  })}>
                                    <Wrench className="mr-1 h-3 w-3" /> Iniciado
                                  </Button>
                                )}
                                {(s === "manual_aceito" || s === "manual_iniciado" || s === "manual_limite_atingido") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title="Voltar para Pendente"
                                    onClick={() => askConfirm({
                                      title: "Voltar para Pendente?",
                                      description: `O pedido ${m.provider_pedido_id.slice(0,8)} retornará ao status Pendente.`,
                                      confirmLabel: "Voltar para Pendente",
                                      onConfirm: () => setManualStatus(m, "manual_pendente", { force: true }),
                                    })}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-transparent" title="Sem sucesso">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-72">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">Motivo da falha</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {FAIL_REASONS.map((r) => (
                                      <DropdownMenuItem
                                        key={r}
                                        onClick={() => {
                                          if (r.startsWith("Outro")) {
                                            setFailTarget(m); setFailReason(r); setFailCustom(""); setFailOpen(true);
                                          } else {
                                            askConfirm({
                                              title: "Marcar como Sem sucesso?",
                                              description: `Motivo: ${r}. O pedido ${m.provider_pedido_id.slice(0,8)} será encerrado.`,
                                              confirmLabel: "Confirmar",
                                              variant: "destructive",
                                              onConfirm: () => setManualStatus(m, "manual_sem_sucesso", { notes: r }),
                                            });
                                          }
                                        }}
                                        className="text-xs"
                                      >
                                        {r}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                            {(isDone || isFail) && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => askConfirm({
                                title: "Reabrir pedido?",
                                description: `O pedido ${m.provider_pedido_id.slice(0,8)} voltará para o status Aceito/Config.`,
                                confirmLabel: "Reabrir",
                                onConfirm: () => setManualStatus(m, "manual_aceito", { notes: null, force: true }),
                              })}>
                                <RotateCcw className="mr-1 h-3 w-3" /> Reabrir
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Detalhes" onClick={() => { setDetailsData(m as any); setDetailsOpen(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
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
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do pedido</DialogTitle>
            <DialogDescription>Dados completos retornados pela API do provedor.</DialogDescription>
          </DialogHeader>
          {detailsData && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ID</div>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono text-[11px]">{detailsData.id || "—"}</code>
                    {detailsData.id && (
                      <button onClick={() => copy(detailsData.id)} className="text-muted-foreground hover:text-foreground">
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
                  <div className="font-mono">{detailsData.status}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Criado em</div>
                  <div>{new Date(detailsData.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Link público</div>
                  {(() => {
                    const linkId = (detailsData as any).provider_pedido_id ?? detailsData.id;
                    return linkId ? (
                      <a href={`${window.location.origin}/recargas/${linkId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "—";
                  })()}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resposta bruta da API</div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copy(JSON.stringify(detailsData.raw ?? detailsData, null, 2))}>
                    <Copy className="mr-1 h-3 w-3" /> Copiar JSON
                  </Button>
                </div>
                <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
{JSON.stringify(detailsData.raw ?? detailsData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descrever motivo da falha</DialogTitle>
            <DialogDescription>Esse motivo será salvo junto ao pedido para auditoria.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Motivo selecionado</div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">{failReason || "—"}</div>
            <Textarea
              value={failCustom}
              onChange={(e) => setFailCustom(e.target.value)}
              placeholder="Descreva o que aconteceu..."
              className="min-h-24 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFailOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!failCustom.trim() || !failTarget}
              onClick={async () => {
                if (!failTarget) return;
                await setManualStatus(failTarget, "manual_sem_sucesso", { notes: failCustom.trim() });
                setFailOpen(false);
                setFailTarget(null);
                setFailCustom("");
                setFailReason("");
              }}
            >
              <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Marcar como sem sucesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!confirming) setConfirmOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmData?.title ?? "Confirmar"}</DialogTitle>
            <DialogDescription>{confirmData?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={confirming} onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant={confirmData?.variant === "destructive" ? "destructive" : "default"}
              disabled={confirming}
              onClick={async () => {
                if (!confirmData) return;
                try {
                  setConfirming(true);
                  await confirmData.onConfirm();
                } finally {
                  setConfirming(false);
                  setConfirmOpen(false);
                }
              }}
            >
              {confirming ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {confirmData?.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RefundSaleDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        data={refundData}
        onSuccess={() => { loadAll(); }}
      />
    </PageContainer>
  );
}
