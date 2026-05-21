import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, KeyRound, Copy, RefreshCcw, Ban, Trash2, MoreVertical, Search, FlaskConical, AlertTriangle, X, Coins, ExternalLink, Calendar, Eye, Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

type ConfirmAction = "reset-hwid" | "revoke-license";
const CONFIRM_META: Record<ConfirmAction, { word: string; title: string; desc: string; btn: string; danger?: boolean }> = {
  "reset-hwid": {
    word: "RESETAR",
    title: "Resetar Device",
    desc: "Isso irá desvincular o dispositivo (HWID) atual da licença. O cliente poderá ativá-la em outro device.",
    btn: "Resetar Device",
  },
  "revoke-license": {
    word: "REVOGAR",
    title: "Revogar licença",
    desc: "Isso irá revogar permanentemente a licença. O cliente perderá o acesso imediatamente.",
    btn: "Revogar licença",
    danger: true,
  },
};

// Duração de cada plano em dias (lifetime = sem expiração)
const PLAN_DAYS: Record<string, number | null> = {
  pro_1d: 1,
  pro_7d: 7,
  pro_15d: 15,
  pro_30d: 30,
  trial: 15 / (24 * 60), // 15 minutos
  lifetime: null,
  credits: null, // Recargas não expiram
};

type Order = {
  id: string;
  source?: "orders" | "provider_credit_orders";
  provider_order_id?: string | null;
  license_type: string;
  product_type?: string | null;
  credit_amount?: number | null;
  price_cents: number;
  status: string;
  license_key: string | null;
  provider_response: any;
  notes: string | null;
  created_at: string;
  is_test: boolean;
  client_id: string | null;
  customer_id: string | null;
};

const LABEL: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
  trial: "Teste 15min",
  credits: "Pacote de Recargas",
};

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const isCreditOrder = (o: Pick<Order, "product_type" | "license_type">) =>
  o.product_type === "credits" || o.license_type === "credits";

const getProviderOrderId = (o: Pick<Order, "provider_order_id" | "provider_response" | "notes">) => {
  if (o.provider_order_id) return o.provider_order_id;
  const resp = o.provider_response as any;
  return resp?.data?.pedidoId || resp?.data?.id || resp?.pedidoId || resp?.id || (o.notes?.match(/ID Provedor: ([\w-]+)/)?.[1]) || null;
};

const normalizeCreditStatus = (status: unknown) => {
  const original = String(status ?? "").trim();
  const s = original.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (["finalizado", "finalizada", "concluido", "concluida", "sucesso", "success", "succeeded", "completed", "complete", "done"].includes(s)) return "completed";
  if (["aguardando", "processando", "pending", "processing", "configurando", "em_processamento"].includes(s)) return "configurando";
  if (["cancelado", "canceled", "cancelled"].includes(s)) return "cancelado";
  if (["falha", "falhou", "failed", "erro", "error"].includes(s)) return "failed";
  if (["reembolsado", "refunded"].includes(s)) return "reembolsado";
  return original || "configurando";
};

const getEffectiveStatus = (o: Pick<Order, "status" | "product_type" | "license_type" | "provider_response">) => {
  if (!isCreditOrder(o)) return o.status;
  const resp = o.provider_response as any;
  const providerStatus: string | undefined = resp?.data?.status ?? resp?.status;
  return normalizeCreditStatus(providerStatus ?? o.status);
};

function getExpiry(o: { license_type: string; created_at: string; status: string }) {
  const days = PLAN_DAYS[o.license_type];
  if (days === null) return { date: null as Date | null, label: "Vitalícia", remaining: "Nunca expira", expired: false, lifetime: true };
  if (days === undefined) return { date: null, label: "—", remaining: "", expired: false, lifetime: false };
  const created = new Date(o.created_at).getTime();
  const exp = new Date(created + days * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const diff = exp.getTime() - now;
  const expired = diff <= 0;
  let remaining = "";
  if (expired) {
    remaining = "Expirada";
  } else {
    const totalMin = Math.floor(diff / 60000);
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    if (d > 0) remaining = `${d}d ${h}h restantes`;
    else if (h > 0) remaining = `${h}h ${m}m restantes`;
    else remaining = `${m}m restantes`;
  }
  return { date: exp, label: exp.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }), remaining, expired, lifetime: false };
}

export default function RevendedorLicencas() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [customers, setCustomers] = useState<Record<string, { display_name: string; whatsapp: string }>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [tab, setTab] = useState<"chaves" | "recargas">("chaves");
  const [confirmTarget, setConfirmTarget] = useState<{ order: Order; action: ConfirmAction } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Order | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [, tick] = useState(0);

  // Tick para atualizar contagem de "restantes" a cada minuto
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    // Sincroniza status dos pedidos de recargas pendentes com o provedor antes de listar
    try {
      await invokeAuthenticatedFunction("lovable-credits-api?action=sync_my_pending", { method: "POST" });
    } catch (e) {
      console.warn("sync_my_pending falhou", e);
    }

    const [{ data: os }, { data: creditRows }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,license_type,product_type,credit_amount,price_cents,status,license_key,provider_response,notes,created_at,is_test,client_id,customer_id")
        .eq("reseller_id", r.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("provider_credit_orders")
        .select("id,pedido_id,creditos,preco_cents,status,email_convite_bot,workspace_id,workspace_name,provider_response,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const baseOrders = ((os ?? []) as Order[]).map((o) => ({ ...o, source: "orders" as const }));
    const knownProviderIds = new Set(baseOrders.filter(isCreditOrder).map(getProviderOrderId).filter(Boolean) as string[]);
    const providerOrders = ((creditRows ?? []) as any[])
      .filter((p) => !knownProviderIds.has(p.pedido_id))
      .map((p): Order => ({
        id: p.id,
        source: "provider_credit_orders",
        provider_order_id: p.pedido_id,
        license_type: "credits",
        product_type: "credits",
        credit_amount: p.creditos ?? null,
        price_cents: Number(p.preco_cents ?? 0),
        status: p.status ?? "aguardando",
        license_key: null,
        provider_response: p.provider_response,
        notes: `ID Provedor: ${p.pedido_id}`,
        created_at: p.created_at,
        is_test: false,
        client_id: user.id,
        customer_id: null,
      }));
    const list = [...baseOrders, ...providerOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setOrders(list);

    const clientIds = Array.from(new Set(list.map(o => o.client_id).filter(Boolean) as string[]));
    const customerIds = Array.from(new Set(list.map(o => o.customer_id).filter(Boolean) as string[]));

    if (clientIds.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", clientIds);
      const map: typeof clients = {};
      (ps ?? []).forEach((p: any) => { map[p.id] = { display_name: p.display_name, email: p.email }; });
      setClients(map);
    } else setClients({});

    if (customerIds.length) {
      const { data: cs } = await supabase
        .from("reseller_customers")
        .select("id,display_name,whatsapp")
        .in("id", customerIds);
      const map: typeof customers = {};
      (cs ?? []).forEach((c: any) => { map[c.id] = { display_name: c.display_name, whatsapp: c.whatsapp }; });
      setCustomers(map);
    } else setCustomers({});

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const runLicenseAction = async (
    o: Order,
    action: "reset-hwid" | "revoke-license" | "delete-license" | "confirm-invite",
    confirmMsg?: string,
  ) => {
    if (action !== "confirm-invite" && !o.license_key) return toast.error("Pedido sem chave de licença");
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionLoading(`${o.id}:${action}`);

    if (action === "confirm-invite") {
      // Pega o pedidoId do provedor
      const resp = o.provider_response as any;
      const pedidoId = resp?.data?.pedidoId || resp?.pedidoId || (o.notes?.match(/ID Provedor: (\w+)/)?.[1]);
      
      if (!pedidoId) {
        setActionLoading(null);
        return toast.error("ID do pedido no provedor não encontrado.");
      }

      const { data, error } = await invokeAuthenticatedFunction(`lovable-credits-api?action=confirm_invite&id=${pedidoId}`, {
        method: "POST"
      });
      
      setActionLoading(null);
      if (error || (data as any)?.error) {
        return toast.error((data as any)?.error ?? error?.message ?? "Falha ao confirmar convite");
      }
      toast.success("Convite confirmado com sucesso!");
      load();
      return;
    }

    const { data, error } = await supabase.functions.invoke("reseller-license-action", {
      body: { action, license_key: o.license_key, order_id: o.id },
    });
// ... keep existing code
    setActionLoading(null);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? "Falha na ação";
      return toast.error(msg);
    }
    if (action === "reset-hwid") toast.success("HWID resetado");
    if (action === "revoke-license") toast.success("Licença revogada");
    if (action === "delete-license") toast.success("Licença excluída");
    load();
  };

  const requestRefund = async (o: Order) => {
    const pedidoId = getProviderOrderId(o);
    if (!pedidoId) return toast.error("ID do pedido no provedor não encontrado");
    if (!confirm("Solicitar reembolso proporcional dos recargas não enviados? O valor será creditado no seu saldo.")) return;
    setActionLoading(`${o.id}:refund`);
    const { data, error } = await invokeAuthenticatedFunction(`lovable-credits-api?action=refund_order&id=${pedidoId}`, { method: "POST" });
    setActionLoading(null);
    if (error || !(data as any)?.success) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha ao solicitar reembolso");
    }
    const d = (data as any)?.data ?? {};
    toast.success(`Reembolso de R$ ${d.valorReembolsoReais ?? "—"} creditado no saldo`);
    load();
  };

  const copy = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chave copiada");
  };

  const customerName = (o: Order) => {
    if (o.customer_id && customers[o.customer_id]) return customers[o.customer_id].display_name;
    if (o.client_id && clients[o.client_id]) return clients[o.client_id].display_name ?? clients[o.client_id].email ?? "—";
    return "—";
  };
  const customerContact = (o: Order) => {
    if (o.customer_id && customers[o.customer_id]) return customers[o.customer_id].whatsapp;
    if (o.client_id && clients[o.client_id]) return clients[o.client_id].email ?? "";
    return "";
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter(o => {
      const isCredits = isCreditOrder(o);
      if (tab === "chaves" && isCredits) return false;
      if (tab === "recargas" && !isCredits) return false;
      if (filterType !== "all" && o.license_type !== filterType) return false;
      if (filterStatus !== "all" && getEffectiveStatus(o) !== filterStatus) return false;
      if (!s) return true;
      const name = customerName(o).toLowerCase();
      const contact = customerContact(o).toLowerCase();
      const key = (o.license_key ?? "").toLowerCase();
      const providerId = (getProviderOrderId(o) ?? "").toLowerCase();
      return name.includes(s) || contact.includes(s) || key.includes(s) || providerId.includes(s);
    });
  }, [orders, search, filterType, filterStatus, tab, clients, customers]);

  const counts = useMemo(() => {
    let chaves = 0, recargas = 0;
    orders.forEach(o => {
      const isCredits = isCreditOrder(o);
      if (isCredits) recargas++; else chaves++;
    });
    return { chaves, recargas };
  }, [orders]);

  const types = useMemo(() => {
    const set = new Set(orders.map(o => o.license_type));
    return Array.from(set);
  }, [orders]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      completed: { label: "Concluída", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
      configurando: { label: "Configurando", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
      aguardando: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
      processando: { label: "Processando", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
      pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
      failed: { label: "Falhou", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
      falha: { label: "Falhou", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
      cancelado: { label: "Cancelado", cls: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
      reembolsado: { label: "Reembolsado", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
      revoked: { label: "Revogada", cls: "bg-muted text-muted-foreground border-border" },
    };
    const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
    return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
  };

  const failedCount = useMemo(() => orders.filter(o => getEffectiveStatus(o) === "failed").length, [orders]);
  const [failedAck, setFailedAck] = useState(false);
  const DISMISS_KEY = "licencas:failed-dismissed-count";
  const [dismissedCount, setDismissedCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  });

  const showFailedBanner = failedCount > 0 && failedCount > dismissedCount;

  const handleFailedClick = () => {
    setFailedAck(true);
    setFilterStatus("failed");
  };

  const dismissFailedBanner = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(DISMISS_KEY, String(failedCount));
    setDismissedCount(failedCount);
    setFailedAck(false);
  };

  return (
    <div className="relative min-h-screen space-y-6 overflow-hidden">
      {/* Decorative background like Indique e Ganhe */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -right-20 bottom-40 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="relative space-y-6">
        <PageHeader
          title="Minhas Vendas"
          description="Histórico completo das chaves geradas e recargas de recargas da sua conta."
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "chaves" | "recargas")} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 sm:w-[320px]">
              <TabsTrigger 
                value="chaves" 
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-black"
              >
                <KeyRound className="h-4 w-4" />
                Chaves
                <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-mono">{counts.chaves}</span>
              </TabsTrigger>
              <TabsTrigger 
                value="recargas" 
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-black"
              >
                <Coins className="h-4 w-4" />
                Comprar Recargas
                <span className="ml-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-mono">{counts.recargas}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="outline" onClick={load} disabled={loading} className="w-full border-white/10 bg-white/5 sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            {loading ? "Carregando..." : "Atualizar"}
          </Button>
        </div>

        {showFailedBanner && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleFailedClick}
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-left transition-all hover:bg-rose-500/10 active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-500">Atenção</p>
              <p className="text-xs text-rose-500/70">
                Você tem {failedCount} {failedCount === 1 ? "geração com falha" : "gerações com falha"}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={dismissFailedBanner} className="h-8 w-8 p-0 text-rose-500/50 hover:bg-rose-500/10 hover:text-rose-500">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, contato ou chave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 border-white/10 bg-white/5 pl-10 focus:border-primary/50"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-11 border-white/10 bg-white/5"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {types.map(t => (
                <SelectItem key={t} value={t}>{LABEL[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-11 border-white/10 bg-white/5"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="revoked">Revogada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.03]">
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Cliente</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pedido</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tipo</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-2 text-xs text-muted-foreground">Carregando histórico...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
                      {tab === "recargas" ? <Coins className="h-8 w-8" /> : <KeyRound className="h-8 w-8" />}
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-500">Nenhum registro encontrado.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const busy = actionLoading?.startsWith(`${o.id}:`);
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">{customerName(o)}</div>
                        <div className="text-[10px] text-zinc-500">{customerContact(o)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <code className="font-mono text-[11px] text-zinc-400">{getProviderOrderId(o) ?? o.id.slice(0, 8)}</code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-300">
                            {o.product_type === "credits" ? `Recargas (${o.credit_amount})` : (LABEL[o.license_type] ?? o.license_type)}
                          </span>
                          {o.is_test && (
                            <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[9px] font-bold uppercase text-amber-500">
                              Teste
                            </Badge>
                          )}
                          <div className="ml-2">{statusBadge(getEffectiveStatus(o))}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setDetailsTarget(o)}
                            className="h-8 border-white/10 bg-white/5 text-xs font-bold transition-all hover:bg-primary hover:text-black"
                          >
                            <Eye className="mr-2 h-3.5 w-3.5" /> Detalhes
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "relative h-8 w-8 border bg-white/5 text-zinc-400 hover:text-white",
                                  isCreditOrder(o) && String(getEffectiveStatus(o)).toLowerCase() === "cancelado"
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                                    : "border-white/5"
                                )}
                                disabled={busy || (!o.license_key && !isCreditOrder(o))}
                                title={isCreditOrder(o) && String(getEffectiveStatus(o)).toLowerCase() === "cancelado" ? "Reembolso disponível" : undefined}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isCreditOrder(o) && String(getEffectiveStatus(o)).toLowerCase() === "cancelado" ? (
                                  <>
                                    <Coins className="h-4 w-4" />
                                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0F0F11] animate-pulse" />
                                  </>
                                ) : (
                                  <MoreVertical className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#0F0F11] backdrop-blur-xl">
                              {isCreditOrder(o) ? (
                                <>
                                  {String(getEffectiveStatus(o)).toLowerCase() === "cancelado" ? (
                                    <DropdownMenuItem
                                      className="text-xs text-emerald-400 focus:bg-emerald-500 focus:text-black"
                                      onClick={() => requestRefund(o)}
                                    >
                                      <Coins className="mr-2 h-3.5 w-3.5" /> Solicitar reembolso
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      className="text-xs focus:bg-primary focus:text-black"
                                      onClick={() => window.open(`https://revendovable.store/recargas/${getProviderOrderId(o) ?? o.id}`, "_blank", "noopener,noreferrer")}
                                    >
                                      <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir pedido
                                    </DropdownMenuItem>
                                  )}
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem className="text-xs focus:bg-primary focus:text-black" onClick={() => { setConfirmInput(""); setConfirmTarget({ order: o, action: "reset-hwid" }); }}>
                                    <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Resetar Device
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-xs focus:bg-primary focus:text-black" onClick={() => { setConfirmInput(""); setConfirmTarget({ order: o, action: "revoke-license" }); }}>
                                    <Ban className="mr-2 h-3.5 w-3.5" /> Revogar licença
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!isCreditOrder(o) && (
                                <>
                                  <DropdownMenuSeparator className="bg-white/5" />
                                  <DropdownMenuItem
                                    className="text-xs text-rose-500 focus:bg-rose-500 focus:text-white"
                                    onClick={() => runLicenseAction(o, "delete-license", "Excluir definitivamente esta licença? Esta ação não pode ser desfeita.")}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir licença
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-4 md:hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-zinc-500">Nenhum registro encontrado.</p>
          </div>
        ) : (
          filtered.map((o) => {
            const exp = getExpiry(o);
            const busy = actionLoading?.startsWith(`${o.id}:`);
            return (
              <Card 
                key={o.id} 
                className={cn(
                  "relative overflow-hidden border-white/5 bg-white/[0.02] p-0 transition-all active:scale-[0.98]",
                  getEffectiveStatus(o) === 'completed' ? "ring-1 ring-emerald-500/10" : ""
                )}
                onClick={() => setDetailsTarget(o)}
              >
                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">{formatDate(o.created_at)}</span>
                      <h3 className="font-display text-base font-black text-white">{customerName(o)}</h3>
                      {customerContact(o) && <p className="text-[10px] text-zinc-500/80">{customerContact(o)}</p>}
                      <code className="mt-0.5 font-mono text-[10px] text-zinc-500">Pedido: {getProviderOrderId(o) ?? o.id.slice(0, 8)}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(getEffectiveStatus(o))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 border border-white/5 bg-white/5" disabled={busy || (!o.license_key && !isCreditOrder(o))}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#0F0F11]">
                          {isCreditOrder(o) ? (
                            <>
                              {String(getEffectiveStatus(o)).toLowerCase() === "cancelado" ? (
                                <DropdownMenuItem className="text-emerald-400" onClick={() => requestRefund(o)}>
                                  <Coins className="mr-2 h-3.5 w-3.5" /> Solicitar reembolso
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => window.open(`https://revendovable.store/recargas/${getProviderOrderId(o) ?? o.id}`, "_blank")}>
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir pedido
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => setConfirmTarget({ order: o, action: "reset-hwid" })}>
                                <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Resetar Device
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirmTarget({ order: o, action: "revoke-license" })}>
                                <Ban className="mr-2 h-3.5 w-3.5" /> Revogar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/5" />
                              <DropdownMenuItem className="text-rose-500" onClick={() => runLicenseAction(o, "delete-license", "Excluir?")}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[9px] font-bold text-primary">
                      {o.product_type === "credits" ? `Recargas (${o.credit_amount})` : (LABEL[o.license_type] ?? o.license_type)}
                    </Badge>
                    {o.is_test && (
                      <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[9px] font-bold text-amber-500 uppercase">Teste</Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-zinc-600" />
                    <span className="text-[10px] font-medium text-zinc-500">
                      {exp.lifetime ? "Vitalícia" : exp.expired ? "Expirada" : exp.remaining}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary">
                    <span className="text-[10px] font-bold uppercase tracking-widest">Ver Detalhes</span>
                    <Eye className="h-3 w-3" />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            {filtered.length} {tab === "recargas" ? "recargas listadas" : "chaves listadas"}
          </p>
        </div>
      )}

      <Dialog
        open={!!confirmTarget}
        onOpenChange={(o) => { if (!o) { setConfirmTarget(null); setConfirmInput(""); } }}
      >
        <DialogContent className="sm:max-w-md border-white/10 bg-[#0F0F11]">
          {confirmTarget && (() => {
            const meta = CONFIRM_META[confirmTarget.action];
            const matches = confirmInput.trim().toUpperCase() === meta.word;
            const busy = actionLoading === `${confirmTarget.order.id}:${confirmTarget.action}`;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <AlertTriangle className={`h-5 w-5 ${meta.danger ? "text-rose-500" : "text-amber-500"}`} />
                    {meta.title}
                  </DialogTitle>
                  <DialogDescription className="pt-2 text-zinc-400">{meta.desc}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs space-y-2">
                    <div className="flex justify-between"><span className="text-zinc-500">Cliente:</span> <span className="font-bold text-white">{customerName(confirmTarget.order)}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Chave:</span> <span className="font-mono text-primary">{confirmTarget.order.license_key}</span></div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-word" className="text-zinc-400">
                      Para confirmar, digite <span className="font-mono font-bold text-white uppercase">{meta.word}</span> abaixo:
                    </Label>
                    <Input
                      id="confirm-word"
                      autoFocus
                      autoComplete="off"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      placeholder={meta.word}
                      className={cn("h-11 border-white/10 bg-white/5 text-white", matches && "border-primary focus-visible:ring-primary/20")}
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" className="border-white/10 bg-white/5 text-zinc-400" onClick={() => { setConfirmTarget(null); setConfirmInput(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    variant={meta.danger ? "destructive" : "default"}
                    disabled={!matches || busy}
                    className={cn(!meta.danger && "bg-primary font-bold text-black hover:bg-primary/90")}
                    onClick={async () => {
                      const target = confirmTarget;
                      await runLicenseAction(target.order, target.action);
                      setConfirmTarget(null);
                      setConfirmInput("");
                    }}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {meta.btn}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => { if (!o) setDetailsTarget(null); }}>
        <DialogContent className="sm:max-w-lg border-white/10 bg-[#0F0F11]">
          {detailsTarget && (() => {
            const exp = getExpiry(detailsTarget);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-white">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Info className="h-5 w-5" />
                    </div>
                    Detalhes da Venda
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Data da Venda</p>
                      <p className="flex items-center gap-2 text-sm font-bold text-white">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        {formatDate(detailsTarget.created_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status</p>
                      <div className="mt-1">{statusBadge(getEffectiveStatus(detailsTarget))}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Informações do Cliente</p>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Nome:</span>
                        <span className="text-sm font-bold text-white">{customerName(detailsTarget)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Contato:</span>
                        <span className="text-sm font-medium text-zinc-300">{customerContact(detailsTarget) || "—"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Dados do Produto</p>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Produto:</span>
                        <span className="text-sm font-bold text-primary">
                          {detailsTarget.product_type === "credits" ? `Recargas (${detailsTarget.credit_amount})` : (LABEL[detailsTarget.license_type] ?? detailsTarget.license_type)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Valor Pago:</span>
                        <span className="font-display text-lg font-black text-white">{formatBRL(detailsTarget.price_cents)}</span>
                      </div>
                      <div className="pt-2 border-t border-white/5">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          {isCreditOrder(detailsTarget) ? "ID do Pedido" : "Chave de Licença"}
                        </p>
                        <button
                          onClick={() => copy(isCreditOrder(detailsTarget) ? (getProviderOrderId(detailsTarget) ?? detailsTarget.id) : detailsTarget.license_key!)}
                          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-black/40 p-3 transition-all hover:bg-black/60"
                        >
                          <span className="font-mono text-sm text-primary">
                            {isCreditOrder(detailsTarget) ? (getProviderOrderId(detailsTarget) ?? detailsTarget.id) : detailsTarget.license_key || "—"}
                          </span>
                          <Copy className="h-4 w-4 text-zinc-500" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {!isCreditOrder(detailsTarget) && (
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Validade</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">{exp.lifetime ? "Vitalícia" : exp.label}</p>
                          <p className={cn("text-xs font-medium", exp.expired ? "text-rose-500" : "text-primary")}>
                            {exp.remaining}
                          </p>
                        </div>
                        <Calendar className="h-8 w-8 text-white/5" />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button 
                    className="w-full bg-white/5 font-bold text-white hover:bg-white/10" 
                    variant="ghost" 
                    onClick={() => setDetailsTarget(null)}
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
