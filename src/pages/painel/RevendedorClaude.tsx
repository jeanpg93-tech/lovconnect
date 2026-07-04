import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer } from "@/components/painel/PageHeader";
import { WalletBalanceRuleNotice } from "@/components/painel/WalletBalanceRuleNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Copy, Check, AlertTriangle, History as HistoryIcon, KeyRound, CheckCircle2, Search, User, MessageCircle, Mail, Ban, Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import ApiKeyReveal from "@/components/painel/ApiKeyReveal";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Conta de testes Jean Gomes — únicos com botão "Cancelar venda" no momento.
const TEST_USER_ID = "beae9f73-5c2c-4878-bfc5-41e9e2faf15e";

type PlanCode = "pro_30d" | "5x_7d" | "5x_30d" | "20x_30d";
type MarkupMode = "percent" | "fixed_add" | "final";

const PLAN_LABELS: Record<PlanCode, string> = {
  "pro_30d": "Pro · 30 dias",
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};
const PLAN_ORDER: PlanCode[] = ["pro_30d", "5x_7d", "5x_30d", "20x_30d"];

const PLAN_LIMITS: Record<PlanCode, string> = {
  "pro_30d": "500 mil tokens / 12h",
  "5x_7d": "1,25 Milhões de tokens / 12h",
  "5x_30d": "2,5 Milhões de tokens / 12h",
  "20x_30d": "10 Milhões de tokens / 12h",
};

const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function computeSale(cost: number, mode: MarkupMode, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

type PriceRow = { plan_code: PlanCode; sale_price_cents: number; is_active: boolean };

const PLAN_GRADIENTS: Record<PlanCode, string> = {
  "pro_30d": "from-emerald-500/20 via-emerald-500/5 to-transparent",
  "5x_7d": "from-sky-500/20 via-sky-500/5 to-transparent",
  "5x_30d": "from-blue-500/20 via-blue-500/5 to-transparent",
  "20x_30d": "from-primary/25 via-primary/5 to-transparent",
};
const PLAN_BADGES: Partial<Record<PlanCode, { label: string; cls: string }>> = {
  "20x_30d": { label: "Popular", cls: "bg-primary/15 text-primary border-primary/30" },
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  issued: { label: "Emitida", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  redeemed: { label: "Resgatada", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  expired: { label: "Expirada", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  failed: { label: "Falhou", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  refunded: { label: "Estornada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  cancelled: { label: "Cancelada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  cancel_failed: { label: "Falha no cancelamento", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
};

export default function RevendedorClaude() {
  const { user } = useAuth();
  const canCancel = user?.id === TEST_USER_ID;
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [issuing, setIssuing] = useState<PlanCode | null>(null);
  const [revealed, setRevealed] = useState<{
    code: string;
    plan: PlanCode;
    apiKey?: string | null;
    userId?: string | null;
    providerBaseUrl?: string | null;
    customerName?: string;
    customerWhatsapp?: string;
  } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("20x_30d");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "redeemed" | "expired" | "cancelled" | "failed">("all");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecks, setConfirmChecks] = useState({ data: false, debit: false, once: false });
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadAll = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", uid).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const [{ data: def }, { data: ov }, { data: hist }, { data: bal }] = await Promise.all([
      supabase.from("claude_plan_prices").select("plan_code, markup_mode, markup_value_cents, sale_price_cents, is_active"),
      supabase.from("claude_reseller_price_overrides").select("*").eq("reseller_id", r.id),
      supabase.from("claude_orders").select("id, plan_code, status, sale_price_cents, created_at, error_message, code, provider_key_id, provider_api_key, customer_name, customer_whatsapp, customer_email").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
    ]);

    const merged: PriceRow[] = PLAN_ORDER
      .map((pc) => {
        const base: any = (def ?? []).find((x: any) => x.plan_code === pc);
        if (!base || !base.is_active) return null;
        const override: any = (ov ?? []).find((x: any) => x.plan_code === pc && x.is_active);
        const sale = override ? override.sale_price_cents : base.sale_price_cents;
        return { plan_code: pc, sale_price_cents: sale, is_active: true } as PriceRow;
      })
      .filter((x): x is PriceRow => x !== null);
    setPrices(merged);
    setSelectedPlan((prev) =>
      merged.some((m) => m.plan_code === prev)
        ? prev
        : (merged.find((m) => m.plan_code === "20x_30d")?.plan_code ?? merged[0]?.plan_code ?? prev)
    );
    setHistory(hist ?? []);
    setBalance(Number((bal as any)?.balance_cents ?? 0));
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const issue = async (plan: PlanCode) => {
    setIssuing(plan);
    const { data, error, skipped } = await invokeAuthenticatedFunction<any>("claude-issue-key", {
      method: "POST",
      body: {
        plan_code: plan,
        request_id: crypto.randomUUID(),
        customer_name: customerName.trim(),
        customer_whatsapp: customerWhatsapp.replace(/\D+/g, ""),
        customer_email: customerEmail.trim() || null,
      },
    });
    setIssuing(null);
    if (skipped) return toast.error("Sessão expirada");
    if (error) {
      const raw = (data as any)?.error ?? (error as any)?.message ?? "";
      const status = (data as any)?.status;
      let friendly = "Erro ao emitir chave. Tente novamente em instantes.";
      if (raw === "provider_error" || String(raw).includes("provider_error")) {
        friendly =
          status && status >= 500
            ? "O provedor está instável no momento. Aguarde alguns segundos e tente novamente. Se persistir, tente sem preencher o e-mail — ele pode já estar vinculado a outra chave ativa."
            : `O provedor recusou a solicitação${status ? ` (HTTP ${status})` : ""}. Verifique os dados e tente novamente.`;
      } else if (raw === "insufficient_balance") {
        friendly = "Saldo insuficiente para emitir esta chave.";
      } else if (raw === "customer_name_required") {
        friendly = "Informe o nome do cliente.";
      } else if (raw === "invalid_plan_code") {
        friendly = "Plano inválido.";
      } else if (raw === "provider_not_configured") {
        friendly = "Integração com o provedor não configurada. Contate o suporte.";
      } else if (typeof raw === "string" && raw) {
        friendly = raw;
      }
      return toast.error(friendly, { duration: 8000 });
    }
    if (data?.code) {
      setRevealed({
        code: data.code,
        plan,
        apiKey: data.api_key ?? null,
        userId: data.user_id ?? null,
        providerBaseUrl: data.provider_base_url ?? null,
        customerName: customerName.trim(),
        customerWhatsapp: customerWhatsapp.replace(/\D+/g, ""),
      });
      setCustomerName("");
      setCustomerWhatsapp("");
      setCustomerEmail("");
      loadAll();
    } else {
      toast.error("O fornecedor não retornou o código.");
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    const { data, error } = await invokeAuthenticatedFunction<any>("claude-cancel-key", {
      method: "POST",
      body: { order_id: cancelTarget.id },
    });
    setCancelling(false);
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Falha ao cancelar";
      if (msg === "already_redeemed") {
        toast.error("Chave já foi resgatada pelo cliente — cancelamento não é mais possível pelo fornecedor.");
      } else {
        toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      setCancelTarget(null);
      loadAll();
      return;
    }
    toast.success(`Chave cancelada. Estorno: ${fmtBRL(data?.refund_cents ?? 0)}`);
    setCancelTarget(null);
    loadAll();
  };

  const formatWhatsapp = (v: string) => {
    const d = v.replace(/\D+/g, "").slice(0, 13);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  };

  const openConfirm = () => {
    if (!selected?.is_active) return;
    if (customerName.trim().length < 2) return toast.error("Informe o nome do cliente");
    if (balance < selected.sale_price_cents) return toast.error("Saldo insuficiente");
    setConfirmChecks({ data: false, debit: false, once: false });
    setConfirmOpen(true);
  };

  const allChecked = confirmChecks.data && confirmChecks.debit && confirmChecks.once;

  const copy = async () => {
    if (!revealed) return;
    const text = revealed.apiKey
      ? `ANTHROPIC_AUTH_TOKEN=${revealed.apiKey}\nANTHROPIC_BASE_URL=${revealed.providerBaseUrl ?? "https://claude-ss.ia.br/"}`
      : revealed.code;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyField = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    toast.success("Copiado!");
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1800);
  };

  const buildClientMessage = () => {
    if (!revealed) return "";
    const nome = revealed.customerName ? `Olá, ${revealed.customerName}!` : "Olá!";
    const plano = PLAN_LABELS[revealed.plan];
    const baseUrl = revealed.providerBaseUrl ?? "https://claude-ss.ia.br/";
    if (revealed.apiKey) {
      return (
`${nome} Aqui estão suas credenciais do plano *${plano}*:

🔑 *API Key (ANTHROPIC_AUTH_TOKEN):*
${revealed.apiKey}

🌐 *Base URL (ANTHROPIC_BASE_URL):*
${baseUrl}

Use no Cursor, Cline ou Claude Code definindo essas duas variáveis. Qualquer dúvida, é só chamar!`
      );
    }
    return (
`${nome} Aqui está sua chave do plano *${plano}*:

🔑 ${revealed.code}

Qualquer dúvida, é só chamar!`
    );
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const selected = prices.find((p) => p.plan_code === selectedPlan) ?? prices[0];
  const filteredHistory = history.filter((h) => {
    if (statusFilter !== "all") {
      const eff = h.status === "cancel_failed" ? "cancelled" : h.status;
      if (eff !== statusFilter) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (h.plan_code ?? "").toLowerCase().includes(q) ||
      (PLAN_LABELS[h.plan_code as PlanCode] ?? "").toLowerCase().includes(q) ||
      (h.customer_name ?? "").toLowerCase().includes(q) ||
      (h.customer_whatsapp ?? "").toLowerCase().includes(q) ||
      (h.id ?? "").toLowerCase().includes(q)
    );
  });
  const countBy = (s: string) => history.filter((h) => (h.status === "cancel_failed" ? "cancelled" : h.status) === s).length;

  return (
    <PageContainer>
      {/* Hero — estilo da página de Licenças */}
      <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-6 sm:p-10 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_60%)]" />

        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 backdrop-blur-sm w-fit">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Emissão instantânea</span>
          </div>

          <div className="space-y-3">
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] text-white">
              Chaves <span className="italic text-primary">Claude</span>
            </h1>
            <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-xl">
              Gere acessos Claude para seus clientes em segundos — o valor é debitado direto do seu saldo, com preço definido pelo seu nível.
            </p>
          </div>
        </div>
      </div>

      <WalletBalanceRuleNotice product="chaves Claude" />

      {/* Plan picker + result */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
            <h3 className="font-display text-sm font-semibold">Escolha o plano</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {prices.map((p) => {
              const active = selectedPlan === p.plan_code;
              const badge = PLAN_BADGES[p.plan_code];
              return (
                <button
                  key={p.plan_code}
                  type="button"
                  onClick={() => p.is_active && setSelectedPlan(p.plan_code)}
                  disabled={!p.is_active}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0",
                    active
                      ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                      : "border-border bg-background/40 hover:border-border/80"
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                      PLAN_GRADIENTS[p.plan_code],
                      active ? "opacity-100" : "opacity-40 group-hover:opacity-70"
                    )}
                  />
                  <div className="relative flex items-start justify-between">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground"
                    )}>
                      <ClaudeIcon className="h-4 w-4" />
                    </div>
                    {badge && (
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="relative mt-3">
                    <div className="font-display text-sm font-semibold">{PLAN_LABELS[p.plan_code]}</div>
                    <div className="text-[11px] text-muted-foreground">{PLAN_LIMITS[p.plan_code]}</div>
                    <div className="mt-2 font-display text-base font-bold">{fmtBRL(p.sale_price_cents)}</div>
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
            <h3 className="font-display text-sm font-semibold">Dados do cliente</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do cliente <span className="text-rose-500">*</span></Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex.: Cliente João"
                  maxLength={120}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WhatsApp (opcional)</Label>
              <div className="relative">
                <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(formatWhatsapp(e.target.value))}
                  placeholder="(11) 91234-5678"
                  inputMode="tel"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-xs">
              E-mail do cliente <span className="text-muted-foreground">(opcional — permite acompanhar o consumo de tokens)</span>
            </Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="cliente@email.com"
                type="email"
                inputMode="email"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-6 mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">3</span>
            <h3 className="font-display text-sm font-semibold">Emitir chave</h3>
          </div>

          <Button
            onClick={openConfirm}
            disabled={!selected?.is_active || issuing !== null}
            size="lg"
            className="w-full relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
          >
            {issuing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><KeyRound className="mr-2 h-4 w-4" /> Gerar chave {selected && PLAN_LABELS[selected.plan_code]}</>
            )}
          </Button>
          {selected && balance < selected.sale_price_cents && (
            <p className="mt-2 text-[11px] text-amber-500">
              Saldo insuficiente. Recarregue sua carteira para emitir este plano.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Minhas chaves Claude</h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold uppercase">{history.length}</Badge>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por plano ou ID…"
              className="pl-8 h-9 text-xs"
            />
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {([
              { key: "all", label: `Todas · ${history.length}` },
              { key: "issued", label: `Emitidas · ${countBy("issued")}` },
              { key: "redeemed", label: `Resgatadas · ${countBy("redeemed")}` },
              { key: "expired", label: `Expiradas · ${countBy("expired")}` },
              { key: "cancelled", label: `Canceladas · ${countBy("cancelled")}` },
              { key: "failed", label: `Falhas · ${countBy("failed")}` },
            ] as const).map((f) => (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={statusFilter === f.key ? "default" : "outline"}
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <details className="group mb-3 rounded-lg border border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2 text-[11px] text-muted-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_24px_-12px_hsl(var(--primary)/0.35)] transition-colors hover:border-primary/60">
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 font-semibold text-primary [&::-webkit-details-marker]:hidden">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/40">
                <Info className="h-3 w-3" />
              </span>
              <span className="flex-1 uppercase tracking-wide text-[11px]">O que significa cada status?</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 space-y-1.5">
              <li className="flex gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", STATUS_MAP.issued.cls)}>Emitida</Badge>
                <span>Chave gerada no fornecedor e ainda não ativada pelo cliente.</span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", STATUS_MAP.redeemed.cls)}>Resgatada</Badge>
                <span>Cliente já ativou a chave e a API está em uso.</span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", STATUS_MAP.expired.cls)}>Expirada</Badge>
                <span>Prazo do plano acabou e o fornecedor invalidou a chave.</span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", STATUS_MAP.cancelled.cls)}>Cancelada</Badge>
                <span>Venda cancelada com estorno do valor para a sua carteira.</span>
              </li>
              <li className="flex gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", STATUS_MAP.failed.cls)}>Falhou</Badge>
                <span>A emissão não completou no fornecedor — o valor não foi debitado.</span>
              </li>
            </ul>
          </details>

          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {history.length === 0 ? "Nenhuma chave emitida ainda." : "Nenhum resultado."}
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredHistory.map((h) => {
                const st = STATUS_MAP[h.status] ?? { label: h.status, cls: "bg-muted text-muted-foreground" };
                return (
                  <div
                    key={h.id}
                    className="rounded-xl border border-border bg-background/40 p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold truncate">
                            {PLAN_LABELS[h.plan_code as PlanCode] ?? h.plan_code}
                          </span>
                        </div>
                        {h.customer_name && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-foreground/80 truncate">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">{h.customer_name}</span>
                            {h.customer_whatsapp && (
                              <span className="text-muted-foreground">· {h.customer_whatsapp}</span>
                            )}
                          </div>
                        )}
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                          #{(h.id ?? "").slice(0, 8).toUpperCase()}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] font-bold uppercase shrink-0", st.cls)}>
                        {st.label}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                      <span className="font-semibold text-foreground">{fmtBRL(h.sale_price_cents)}</span>
                    </div>
                    {h.provider_api_key && (
                      <div className="mt-2">
                        <ApiKeyReveal value={h.provider_api_key} />
                      </div>
                    )}
                    {h.status === "failed" && h.error_message && (
                      <div className="mt-2 text-[10px] text-rose-500/90 line-clamp-2">{h.error_message}</div>
                    )}
                    {canCancel && h.status === "issued" && h.provider_key_id && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                          onClick={() => setCancelTarget(h)}
                        >
                          <Ban className="mr-1 h-3 w-3" /> Cancelar venda
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirmar emissão
            </DialogTitle>
            <DialogDescription>
              Revise os dados antes de gerar a chave Claude.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Plano</span><span className="font-semibold">{selected && PLAN_LABELS[selected.plan_code]}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cliente</span><span className="font-semibold truncate">{customerName || "—"}</span></div>
            {customerWhatsapp && (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">WhatsApp</span><span className="font-semibold">{customerWhatsapp}</span></div>
            )}
            <div className="flex justify-between gap-2 border-t border-border pt-2"><span className="text-muted-foreground">Valor a debitar</span><span className="font-bold text-primary">{selected && fmtBRL(selected.sale_price_cents)}</span></div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={confirmChecks.data} onCheckedChange={(v) => setConfirmChecks((c) => ({ ...c, data: !!v }))} className="mt-0.5" />
              <span className="text-xs leading-relaxed">Confirmo que os dados do cliente estão corretos.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={confirmChecks.debit} onCheckedChange={(v) => setConfirmChecks((c) => ({ ...c, debit: !!v }))} className="mt-0.5" />
              <span className="text-xs leading-relaxed">Estou ciente que o valor será debitado do meu saldo imediatamente.</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={confirmChecks.once} onCheckedChange={(v) => setConfirmChecks((c) => ({ ...c, once: !!v }))} className="mt-0.5" />
              <span className="text-xs leading-relaxed">Entendo que a chave será exibida <strong>apenas uma vez</strong> e devo copiá-la.</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button
              disabled={!allChecked || issuing !== null}
              onClick={async () => {
                if (!selected) return;
                setConfirmOpen(false);
                await issue(selected.plan_code);
              }}
            >
              {issuing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</> : <><KeyRound className="mr-2 h-4 w-4" /> Confirmar e gerar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Chave gerada
            </DialogTitle>
            <DialogDescription>
              {revealed && PLAN_LABELS[revealed.plan]}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Copie agora — estes dados <strong>não serão exibidos novamente</strong>.</span>
          </div>
          {!revealed?.apiKey && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-3">
              <div className="flex-1 font-mono text-sm break-all select-all">{revealed?.code}</div>
              <Button size="sm" variant="outline" onClick={() => revealed && copyField("code", revealed.code)}>
                {copiedField === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {revealed?.apiKey && (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                <div className="font-semibold">Entrega direta ativada 🎉</div>
                <div className="mt-1">Entregue ao seu cliente <strong>apenas</strong> a API Key e a Base URL abaixo. Ele já pode usar direto no Cursor/Cline/Claude Code:</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">API Key (ANTHROPIC_AUTH_TOKEN)</div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
                  <div className="flex-1 font-mono text-xs break-all select-all px-1">{revealed.apiKey}</div>
                  <Button size="sm" variant="outline" onClick={() => copyField("apiKey", revealed.apiKey!)}>
                    {copiedField === "apiKey" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Base URL (ANTHROPIC_BASE_URL)</div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
                  <div className="flex-1 font-mono text-xs break-all select-all px-1">{revealed.providerBaseUrl ?? "https://claude-ss.ia.br/"}</div>
                  <Button size="sm" variant="outline" onClick={() => copyField("baseUrl", revealed.providerBaseUrl ?? "https://claude-ss.ia.br/")}>
                    {copiedField === "baseUrl" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {revealed && (
            <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">Mensagem pronta para o cliente</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyField("msg", buildClientMessage())}>
                    {copiedField === "msg" ? <><Check className="h-4 w-4 mr-1" /> Copiado</> : <><Copy className="h-4 w-4 mr-1" /> Copiar</>}
                  </Button>
                  {revealed.customerWhatsapp && revealed.customerWhatsapp.length >= 10 && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        const num = revealed.customerWhatsapp!.startsWith("55") ? revealed.customerWhatsapp! : `55${revealed.customerWhatsapp}`;
                        const url = `https://wa.me/${num}?text=${encodeURIComponent(buildClientMessage())}`;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" /> Enviar WhatsApp
                    </Button>
                  )}
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-xs font-sans bg-background/60 rounded-md border border-border p-2 max-h-48 overflow-auto">{buildClientMessage()}</pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealed(null)}>Fechar</Button>
            <Button onClick={copy}>
              {copied ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar tudo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-rose-500" /> Cancelar venda Claude
            </DialogTitle>
            <DialogDescription>
              A chave será revogada no fornecedor e o valor debitado voltará ao seu saldo.
            </DialogDescription>
          </DialogHeader>

          {cancelTarget && (
            <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-semibold">{PLAN_LABELS[cancelTarget.plan_code as PlanCode] ?? cancelTarget.plan_code}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-semibold truncate">{cancelTarget.customer_name || "—"}</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                <span>Estorno</span>
                <span>O valor cobrado da sua carteira será devolvido automaticamente.</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              O cliente perderá o acesso imediatamente. Se o fornecedor recusar o cancelamento
              (ex.: janela expirada), nada é debitado e a chave continua ativa.
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>Voltar</Button>
            <Button
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              Revogar chave e estornar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}