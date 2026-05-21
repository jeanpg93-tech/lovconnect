import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Coins, Mail, ChevronRight, CheckCircle2, Copy,
  AlertCircle, ArrowLeft, History, Package, Terminal, RefreshCw, ShieldCheck,
  Sparkles, Zap, TrendingUp, Wallet, MessageSquare, ExternalLink, PlusCircle, ListChecks
} from "lucide-react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

type Plan = { id: string; label: string; credits_amount: number; is_active: boolean; price_cents: number };
type ResellerPrice = { credits_amount: number; price_cents: number; is_active: boolean };
type Tier = { id: string; name: string; effectiveName?: string | null } | null;

const DELIVERY_TYPES = [
  { 
    id: "workspace_proprio", 
    title: "Workspace Próprio", 
    desc: "O bot entra no workspace já existente do cliente via convite.",
    icon: Terminal
  }
];

type CreatedOrder = {
  id?: string;
  pedidoId?: string;
  status?: string;
  emailConviteBot?: string;
  workspaceId?: string;
  workspaceName?: string;
  creditosEnviados?: number;
  etapaProcessamento?: number;
};

export default function RevendedorComprarCreditos() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resellerPrices, setResellerPrices] = useState<Record<number, number>>({});
  const [costs, setCosts] = useState<Record<number, number>>({});
  const [tier, setTier] = useState<Tier>(null);
  const [balance, setBalance] = useState<number | null>(null);
  
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [deliveryType, setDeliveryType] = useState<string>("workspace_proprio");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const [{ data: pl }, { data: rp }, { data: bal }, costsResponse] = await Promise.all([
      supabase.from("credit_pricing_plans").select("id,label,credits_amount,is_active,price_cents").eq("is_active", true).order("credits_amount", { ascending: true }),
      supabase.from("reseller_credit_prices").select("credits_amount,price_cents,is_active").eq("reseller_id", r.id),
      supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
      supabase.functions.invoke("reseller-credit-costs", { method: "GET" }),
    ]);

    setPlans((pl ?? []) as Plan[]);
    const costPayload = (costsResponse.data ?? {}) as { costs?: Record<string, number>; tierName?: string | null; effectiveTierId?: string; effectiveTierName?: string | null };
    const normalizedCosts: Record<number, number> = {};
    Object.entries(costPayload.costs ?? {}).forEach(([credits, cents]) => {
      const key = Number(credits);
      const value = Number(cents);
      if (Number.isFinite(key) && Number.isFinite(value) && value > 0) normalizedCosts[key] = value;
    });
    setCosts(normalizedCosts);
    setTier(costPayload.effectiveTierId ? { id: costPayload.effectiveTierId, name: costPayload.tierName ?? costPayload.effectiveTierName ?? "Nível atual", effectiveName: costPayload.effectiveTierName } : null);

    const rpMap: Record<number, number> = {};
    (rp ?? []).forEach((row: any) => {
      if (row.is_active) rpMap[row.credits_amount] = row.price_cents;
    });
    setResellerPrices(rpMap);

    setBalance(bal?.balance_cents ?? 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

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
    if (error) {
      let parsed: any = null;
      try { parsed = await (error as any)?.context?.json?.(); } catch {}
      const code = parsed?.code ?? parsed?.details?.code;
      const apiMsg = parsed?.error ?? parsed?.message;
      const e: any = new Error(apiMsg || error.message);
      e.code = code;
      throw e;
    }
    if (data?.error) {
      const e: any = new Error(typeof data.error === "string" ? data.error : "Erro");
      e.code = data?.code;
      throw e;
    }
    return data;
  };

  const getPlanCost = (credits?: number | null) => credits ? (costs[credits] ?? 0) : 0;

  const handleCreateOrder = async () => {
    if (!selectedPlan || !resellerId) return;
    const costPrice = getPlanCost(selectedPlan.credits_amount);
    if (!costPrice) {
      toast.error("Preço de custo não definido para este pacote.");
      return;
    }
    if ((balance ?? 0) < costPrice) {
      toast.error("Saldo insuficiente. Recarregue seu saldo na plataforma.");
      return;
    }

    setSubmitting(true);
    setLastOrder(null);
    try {
      const r = await call("reseller_create_order", {
        method: "POST",
        body: { creditos: selectedPlan.credits_amount, tipo_entrega: deliveryType },
      });
      const d = r?.data ?? r;
      const pedidoId: string | undefined = d?.providerPedidoId ?? d?.pedidoId ?? d?.id;
      const chargedPrice = Number(d?.precoCentavos ?? costPrice);
      if (!pedidoId) throw new Error("Provedor não retornou pedidoId.");

      setLastOrder({ ...d, id: pedidoId, pedidoId, creditosEnviados: d?.creditos ?? selectedPlan.credits_amount, status: d?.status });
      setBalance((b) => (b ?? 0) - chargedPrice);
      toast.success("Pedido confirmado!");
      setStep(3);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (err?.code === "INSUFFICIENT_BALANCE" || msg.includes("INSUFFICIENT_BALANCE") || msg.toLowerCase().includes("saldo insuficiente")) {
        setShowErrorModal(true);
      } else {
        toast.error(msg || "Ocorreu um erro ao processar seu pedido.");
      }
      console.error("Order error:", err);
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

  const confirmInvite = async () => {
    const orderId = lastOrder?.id ?? lastOrder?.pedidoId;
    if (!orderId) return;
    setConfirming(true);
    try {
      const r = await call("confirm_invite", { method: "POST", query: { id: orderId } });
      const d = r?.data ?? r;
      const acaoId: string | undefined = d?.acaoId ?? d?.id;
      if (!acaoId) throw new Error("Sem acaoId na resposta");
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const a = await call("action_status", { query: { id: orderId, acao_id: acaoId } });
        const ad = a?.data ?? a;
        if (ad?.status === "finalizada") break;
      }
      const o = await call("order_details", { query: { id: orderId } });
      const od = o?.data ?? o;
      setLastOrder((prev) => ({ ...(prev || {}), ...od, id: orderId }));
      toast.success("Pedido confirmado!");
      setStep(3);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao confirmar convite");
    } finally {
      setConfirming(false);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const formatBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stepsMeta = [
    { n: 1, label: "Pacote" },
    { n: 2, label: "Entrega" },
    { n: 3, label: "Pronto" },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader 
        title="Comprar Créditos" 
        description="Adquira pacotes de créditos Lovable para seus clientes com entrega instantânea." 
      />

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
        {stepsMeta.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <div key={s.n} className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
                  active && "border-primary bg-primary text-primary-foreground shadow-red-glow scale-110",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  !active && !done && "border-border bg-card text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <span className={cn(
                  "text-xs font-semibold uppercase tracking-wider hidden sm:inline transition-colors",
                  active ? "text-foreground" : done ? "text-emerald-500" : "text-muted-foreground"
                )}>{s.label}</span>
              </div>
              {i < stepsMeta.length - 1 && (
                <div className={cn(
                  "h-0.5 w-8 sm:w-16 rounded-full transition-colors duration-300",
                  done ? "bg-emerald-500" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Saldo no Provedor */}
      <div className="mb-8 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Seu Saldo na Plataforma</div>
              <div className="text-2xl sm:text-3xl font-bold font-display bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {balance !== null ? formatBRL(balance) : "—"}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-full border-primary/30 hover:bg-primary/10 hover:border-primary">
            <a href="/painel/revendedor/recarregar" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" /> Recarregar Saldo
            </a>
          </Button>
        </div>
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Escolha um pacote
            </h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">Clique para selecionar</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const salePrice = resellerPrices[p.credits_amount];
              const perCredit = salePrice ? salePrice / p.credits_amount : 0;
              const tierCost = getPlanCost(p.credits_amount);
              const isSelected = selectedPlan?.id === p.id;
              const isPopular = p.credits_amount === 100;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p)}
                  className={cn(
                    "relative group flex flex-col p-5 rounded-2xl border text-left transition-all duration-300 cursor-pointer overflow-hidden",
                    "hover:-translate-y-1 hover:shadow-xl",
                    isSelected
                      ? "border-primary bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg shadow-primary/20 ring-2 ring-primary/40"
                      : "border-border bg-card/40 hover:border-primary/40 hover:bg-card/70 hover:shadow-primary/10"
                  )}
                >
                  {/* Glow */}
                  <div className={cn(
                    "absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl transition-opacity duration-500 pointer-events-none",
                    isSelected ? "bg-primary/30 opacity-100" : "bg-primary/10 opacity-0 group-hover:opacity-100"
                  )} />

                  <div className="relative flex justify-between items-start mb-4">
                    <div className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300",
                      isSelected ? "bg-primary text-primary-foreground scale-110 rotate-3" : "bg-primary/10 text-primary group-hover:scale-110 group-hover:rotate-3"
                    )}>
                      <Coins className="h-5 w-5" />
                    </div>
                    {isPopular && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Popular
                      </span>
                    )}
                  </div>

                  <h3 className="relative font-display text-lg font-bold mb-1">{p.label}</h3>
                  <div className="relative flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-bold font-display text-primary">{p.credits_amount}</span>
                    <span className="text-sm font-normal text-muted-foreground">créditos</span>
                  </div>

                  <div className="relative mt-auto pt-4 border-t border-border/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">Preço de venda</div>
                      <div className="font-bold text-base">{salePrice ? formatBRL(salePrice) : "—"}</div>
                    </div>
                    {perCredit > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">por crédito</div>
                        <div className="text-xs font-mono text-muted-foreground">{formatBRL(perCredit)}</div>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                      <div className="text-xs text-muted-foreground">
                        Preço de custo {tier ? <span className="text-[10px] opacity-70">({tier.name})</span> : null}
                      </div>
                      <div className="text-sm font-bold font-mono text-primary">{tierCost ? formatBRL(tierCost) : "—"}</div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/40 animate-in zoom-in duration-200">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para pacotes
          </Button>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              {/* Tipo de Entrega */}
              <div className="space-y-3">
                <Label className="text-base font-display font-semibold">Tipo de Entrega</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DELIVERY_TYPES.map((type) => (
                    <div 
                      key={type.id}
                      className={cn(
                        "flex flex-col p-4 rounded-xl border transition-all cursor-pointer",
                        deliveryType === type.id 
                          ? "border-primary bg-primary/5" 
                          : "border-border bg-card/40 hover:border-primary/20 hover:bg-card/60"
                      )}
                      onClick={() => setDeliveryType(type.id)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          deliveryType === type.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          <type.icon className="h-4 w-4" />
                        </div>
                        <span className="font-semibold">{type.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{type.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info Workspace Próprio */}
              <div className="rounded-xl border border-border bg-card/30 p-4 text-sm text-muted-foreground flex gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  Após confirmar, o provedor gera um <strong>email do bot</strong>. Você convida esse email no workspace do cliente e clica em <strong>Confirmar Convite</strong> para liberar os créditos.
                </div>
              </div>
            </div>

            {/* Resumo */}
            <div className="rounded-2xl border border-border bg-card/40 p-6 h-fit sticky top-20">
              <h3 className="font-display font-bold mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Resumo do Pedido
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pacote:</span>
                  <span className="font-medium">{selectedPlan?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Créditos:</span>
                  <span className="font-medium">{selectedPlan?.credits_amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entrega:</span>
                  <span className="font-medium">Workspace Próprio</span>
                </div>
                <div className="pt-3 border-t border-border flex justify-between text-base font-bold">
                  <span>Custo Total:</span>
                  <span className="text-primary">
                    {selectedPlan ? (getPlanCost(selectedPlan.credits_amount) ? formatBRL(getPlanCost(selectedPlan.credits_amount)) : "—") : "—"}
                  </span>
                </div>
              </div>
              
              <Button 
                className="w-full mt-6 rounded-full shadow-red-glow"
                disabled={submitting}
                onClick={handleCreateOrder}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...
                  </>
                ) : (
                  <>Confirmar Pedido</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (() => {
        const orderId = lastOrder?.id ?? lastOrder?.pedidoId ?? "";
        const trackUrl = `https://revendovable.store/recarga/${orderId}`;
        const clientMsg =
          `Olá! Seu pedido de ${lastOrder?.creditosEnviados ?? selectedPlan?.credits_amount ?? ""} créditos Lovable foi confirmado com sucesso. ✅\n\n` +
          `Acompanhe o pedido em tempo real pelo link abaixo:\n${trackUrl}\n\n` +
          `Qualquer dúvida estou à disposição!`;
        return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Hero success */}
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-8 text-center">
            <div className="absolute -top-20 -left-20 h-60 w-60 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            {/* Sparkles */}
            <Sparkles className="absolute top-6 left-8 h-4 w-4 text-emerald-400/60 animate-pulse" />
            <Sparkles className="absolute bottom-8 right-10 h-3 w-3 text-emerald-400/60 animate-pulse" style={{ animationDelay: "300ms" }} />
            <Sparkles className="absolute top-12 right-16 h-5 w-5 text-primary/40 animate-pulse" style={{ animationDelay: "600ms" }} />

            <div className="relative inline-flex items-center justify-center mb-5">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-xl animate-pulse" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white ring-8 ring-emerald-500/10 shadow-lg shadow-emerald-500/30 animate-in zoom-in duration-500">
                <CheckCircle2 className="h-10 w-10" strokeWidth={2.5} />
              </div>
            </div>
            <h2 className="relative font-display text-3xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Seu pedido foi confirmado!
            </h2>
            <p className="relative text-muted-foreground max-w-md mx-auto">
              {lastOrder?.creditosEnviados ?? selectedPlan?.credits_amount ?? ""} créditos sendo entregues. Compartilhe o link de acompanhamento com seu cliente.
            </p>
          </div>

          {/* Action grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Link do pedido */}
            <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ExternalLink className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-display font-semibold">Link do Pedido</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acompanhamento em tempo real</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                <a href={trackUrl} target="_blank" rel="noreferrer" className="text-sm font-mono text-primary truncate hover:underline">
                  {trackUrl}
                </a>
                <Button size="sm" variant="ghost" onClick={() => copy(trackUrl)} className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" className="w-full rounded-full" asChild>
                <a href={trackUrl} target="_blank" rel="noreferrer">
                  Abrir página do pedido <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </div>

            {/* Mensagem para cliente */}
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-display font-semibold">Mensagem pronta</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Envie ao seu cliente</div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground font-mono whitespace-pre-line max-h-28 overflow-y-auto">
                {clientMsg}
              </div>
              <Button className="w-full rounded-full shadow-red-glow" onClick={() => copy(clientMsg)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar mensagem
              </Button>
            </div>
          </div>

          {/* Order details */}
          <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ID do Pedido</div>
                <div className="font-mono text-sm font-medium">{lastOrder?.id ?? lastOrder?.pedidoId}</div>
              </div>
              <Button variant="outline" size="sm" onClick={refreshOrder} disabled={refreshing} className="rounded-full">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Atualizar</span>
              </Button>
            </div>

            {lastOrder?.emailConviteBot && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email do bot (convide no workspace do cliente)
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm font-mono break-all">{lastOrder.emailConviteBot}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(lastOrder.emailConviteBot!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {lastOrder?.workspaceName && (
              <div className="text-sm flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Workspace:</span>
                <span className="font-medium">{lastOrder.workspaceName}</span>
              </div>
            )}
          </div>

          {/* CTAs */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="rounded-full h-12 shadow-red-glow" onClick={() => {
              setStep(1);
              setSelectedPlan(null);
              setLastOrder(null);
            }}>
              <PlusCircle className="h-4 w-4 mr-2" /> Novo Pedido
            </Button>
            <Button variant="outline" className="rounded-full h-12" onClick={() => window.location.href = "/painel/revendedor/licencas"}>
              <ListChecks className="h-4 w-4 mr-2" /> Ver Meus Pedidos
            </Button>
          </div>
        </div>
        );
      })()}

      {step === 1 && (
        <div className="mt-8 flex justify-center">
          <Button 
            size="lg" 
            className="rounded-full px-8 shadow-red-glow" 
            disabled={!selectedPlan}
            onClick={() => setStep(2)}
          >
            Continuar <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card/20 text-sm">
          <History className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Acompanhamento</div>
            <p className="text-muted-foreground">
              Você pode acompanhar o status de todos os seus pedidos de créditos na tela de "Licenças geradas".
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card/20 text-sm">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Entrega em Workspace Próprio</div>
            <p className="text-muted-foreground">
              Para workspaces próprios, você precisará confirmar o convite do bot no painel de acompanhamento após o cliente enviar o convite.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showErrorModal} onOpenChange={setShowErrorModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center text-xl">Aviso Importante</DialogTitle>
            <DialogDescription className="text-center text-base pt-2">
              Erro com a criação do pedido, informe o seu gerente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center mt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowErrorModal(false)}
              className="w-full sm:w-auto min-w-[120px]"
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}