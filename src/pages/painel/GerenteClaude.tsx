import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Copy, Check, KeyRound, CheckCircle2, History as HistoryIcon, Search, Sparkles, AlertTriangle, User, MessageCircle, Mail, Activity, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";

type PlanCode = "pro_30d" | "5x_30d" | "20x_30d";

const PLAN_LABELS: Record<PlanCode, string> = {
  pro_30d: "Pro · 30 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};
const PLAN_LIMITS: Record<PlanCode, string> = {
  pro_30d: "500 mil tokens / 12h",
  "5x_30d": "2,5 Milhões de tokens / 12h",
  "20x_30d": "10 Milhões de tokens / 12h",
};
const PLAN_ORDER: PlanCode[] = ["pro_30d", "5x_30d", "20x_30d"];

const PLAN_GRADIENTS: Record<PlanCode, string> = {
  pro_30d: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  "5x_30d": "from-blue-500/20 via-blue-500/5 to-transparent",
  "20x_30d": "from-primary/25 via-primary/5 to-transparent",
};
const PLAN_BADGES: Partial<Record<PlanCode, { label: string; cls: string }>> = {
  "20x_30d": { label: "Popular", cls: "bg-primary/15 text-primary border-primary/30" },
};

type Row = { plan_code: PlanCode; cost_cents: number; is_active: boolean };
type Issued = {
  id: string;
  plan: PlanCode;
  code: string;
  api_key?: string | null;
  cost_cents: number;
  created_at: string;
  customer_name?: string;
  customer_whatsapp?: string;
  customer_email?: string;
};

const HISTORY_KEY = "gerente_claude_issued_v2";

type UsageInfo = {
  email: string;
  status?: string | null;
  tokensConsumed?: number | null;
  tokenLimit?: number | null;
  tokensInWindow?: number | null;
  tokenWindowHours?: number | null;
  percentRemaining?: number | null;
  weeklyTokensInWindow?: number | null;
  weeklyTokenLimit?: number | null;
  accountExpiresAt?: string | null;
};

const fmtTokens = (n: number | null | undefined) => {
  if (n == null || !isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

const formatWhatsapp = (v: string) => {
  const d = v.replace(/\D+/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const fmtBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function GerenteClaude() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Row[]>([]);
  const [selected, setSelected] = useState<PlanCode>("20x_30d");
  const [issuing, setIssuing] = useState<PlanCode | null>(null);
  const [revealed, setRevealed] = useState<{
    id?: string | null;
    code: string;
    plan: PlanCode;
    apiKey?: string | null;
    userId?: string | null;
    providerBaseUrl?: string | null;
    customerName?: string;
    customerWhatsapp?: string;
    customerEmail?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [history, setHistory] = useState<Issued[]>([]);
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [usageByEmail, setUsageByEmail] = useState<Record<string, UsageInfo>>({});
  const [usageByOrderId, setUsageByOrderId] = useState<Record<string, UsageInfo>>({});
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // cost_cents é restrito por RLS de coluna — usa RPC de gerente
      const { data } = await supabase.rpc("admin_claude_plan_prices_full" as any);
      const rows = PLAN_ORDER
        .map((pc) => {
          const row: any = (data ?? []).find((r: any) => r.plan_code === pc);
          if (!row || !row.is_active) return null;
          return { plan_code: pc, cost_cents: row.cost_cents ?? 0, is_active: true } as Row;
        })
        .filter((x): x is Row => x !== null);
      setPlans(rows);
      if (rows.length && !rows.some((r) => r.plan_code === selected)) {
        setSelected(rows[0].plan_code);
      }
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) setHistory(JSON.parse(raw));
      } catch { /* noop */ }
      // Load persistent history from DB (manager manual issuances)
      try {
        const { data: dbRows } = await supabase.rpc(
          "manager_list_claude_manual_orders",
          { _limit: 200 },
        );
        if (dbRows && dbRows.length) {
          setHistory((prev) => {
            const byCode = new Map<string, Issued>();
            for (const r of dbRows as any[]) {
              byCode.set(r.code, {
                id: r.id,
                plan: r.plan_code as PlanCode,
                code: r.code,
                api_key: r.provider_api_key ?? null,
                cost_cents: r.cost_cents ?? 0,
                created_at: r.created_at,
                customer_name: r.customer_name ?? undefined,
                customer_whatsapp: r.customer_whatsapp ?? undefined,
                customer_email: r.customer_email ?? undefined,
              });
            }
            // Keep any localStorage entries not yet in DB
            for (const r of prev) if (!byCode.has(r.code)) byCode.set(r.code, r);
            return Array.from(byCode.values()).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
          });
        }
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, []);

  const loadUsage = async () => {
    setUsageLoading(true);
    const { data, error } = await invokeAuthenticatedFunction<any>(
      "manager-claude-provider-users",
      { method: "POST", body: {} },
    );
    setUsageLoading(false);
    if (error || !data?.users) {
      toast.error("Não foi possível carregar consumo do provedor");
      return;
    }
    const map: Record<string, UsageInfo> = {};
    for (const u of data.users as UsageInfo[]) {
      if (u.email) map[u.email.toLowerCase()] = u;
    }
    setUsageByEmail(map);
    setUsageByOrderId((data.usage_by_order_id ?? {}) as Record<string, UsageInfo>);
    setUsageLoaded(true);
  };

  useEffect(() => {
    if (!loading) loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const persist = (list: Issued[]) => {
    setHistory(list);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* noop */ }
  };

  const issue = async () => {
    if (customerName.trim().length < 2) return toast.error("Informe o nome do cliente");
    const emailTrimmed = customerEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return toast.error("Informe um e-mail válido do cliente");
    }
    setIssuing(selected);
    const { data, error, skipped } = await invokeAuthenticatedFunction<any>(
      "manager-claude-issue-key",
      {
        method: "POST",
        body: {
          plan_code: selected,
          customer_name: customerName.trim(),
          customer_whatsapp: customerWhatsapp.replace(/\D+/g, ""),
          customer_email: emailTrimmed,
        },
      },
    );
    setIssuing(null);
    if (skipped) return toast.error("Sessão expirada");
    if (error) {
      const raw = (data as any)?.error ?? (error as any)?.message ?? "";
      const status = (data as any)?.status;
      let friendly = "Erro ao emitir chave. Tente novamente em instantes.";
      if (raw === "provider_error" || String(raw).includes("provider_error")) {
        friendly =
          status && status >= 500
            ? "O provedor está instável no momento (erro 502). Aguarde alguns segundos e tente novamente. Se persistir, tente sem preencher o e-mail — o e-mail pode já estar vinculado a outra chave ativa."
            : `O provedor recusou a solicitação${status ? ` (HTTP ${status})` : ""}. Verifique os dados e tente novamente.`;
      } else if (raw === "provider_not_configured") {
        friendly = "Integração com o provedor não configurada.";
      } else if (raw === "customer_name_required") {
        friendly = "Informe o nome do cliente.";
      } else if (raw === "invalid_plan_code") {
        friendly = "Plano inválido.";
      } else if (typeof raw === "string" && raw) {
        friendly = raw;
      }
      return toast.error(friendly, { duration: 8000 });
    }
    if (data?.code) {
      setRevealed({
        id: data.id ?? null,
        code: data.code,
        plan: selected,
        apiKey: data.api_key ?? null,
        userId: data.user_id ?? null,
        providerBaseUrl: data.provider_base_url ?? null,
        customerName: customerName.trim(),
        customerWhatsapp: customerWhatsapp.replace(/\D+/g, ""),
        customerEmail: customerEmail.trim() || undefined,
      });
      const cost = plans.find((p) => p.plan_code === selected)?.cost_cents ?? 0;
      const entry: Issued = {
        id: data.id ?? crypto.randomUUID(),
        plan: selected,
        code: data.code,
        api_key: data.api_key ?? null,
        cost_cents: cost,
        created_at: new Date().toISOString(),
        customer_name: customerName.trim(),
        customer_whatsapp: customerWhatsapp.replace(/\D+/g, ""),
        customer_email: customerEmail.trim() || undefined,
      };
      persist([entry, ...history]);
      setCustomerName("");
      setCustomerWhatsapp("");
      setCustomerEmail("");
    } else {
      toast.error("O fornecedor não retornou o código.");
    }
  };

  const copy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      return `${nome} Aqui estão suas credenciais do plano *${plano}*:

🔑 *API Key (ANTHROPIC_AUTH_TOKEN):*
${revealed.apiKey}

🌐 *Base URL (ANTHROPIC_BASE_URL):*
${baseUrl}

Use no Cursor, Cline ou Claude Code definindo essas duas variáveis. Qualquer dúvida, é só chamar!`;
    }
    return `${nome} Aqui está sua chave do plano *${plano}*:

🔑 ${revealed.code}

Qualquer dúvida, é só chamar!`;
  };

  const cancelRevealed = async () => {
    if (!revealed) return;
    if (!confirm("Cancelar esta chave no fornecedor? A chave será revogada imediatamente.")) return;
    setCancelling(true);
    const { data, error } = await invokeAuthenticatedFunction<any>(
      "manager-claude-cancel-key",
      {
        method: "POST",
        body: {
          order_id: revealed.id ?? undefined,
          code: revealed.code,
        },
      },
    );
    setCancelling(false);
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Falha ao cancelar";
      if (msg === "already_redeemed") {
        toast.error("Chave já foi resgatada — não é mais cancelável pelo fornecedor.");
      } else {
        toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      return;
    }
    toast.success("Chave cancelada no fornecedor");
    // remove from local list
    if (revealed.id) {
      persist(history.filter((h) => h.id !== revealed.id));
    }
    setRevealed(null);
  };

  const cancelKey = async (h: { id: string; code: string }) => {
    if (!confirm("Cancelar esta chave no fornecedor? A chave será revogada imediatamente.")) return;
    setCancellingId(h.id);
    const { data, error } = await invokeAuthenticatedFunction<any>(
      "manager-claude-cancel-key",
      { method: "POST", body: { order_id: h.id, code: h.code } },
    );
    setCancellingId(null);
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Falha ao cancelar";
      if (msg === "already_redeemed") {
        toast.error("Chave já foi resgatada — não é mais cancelável pelo fornecedor.");
      } else {
        toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      return;
    }
    toast.success("Chave cancelada no fornecedor");
    persist(history.filter((x) => x.id !== h.id));
    if (revealed?.id === h.id) setRevealed(null);
  };

  if (loading)
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );

  const filteredHistory = history.filter((h) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (PLAN_LABELS[h.plan] ?? "").toLowerCase().includes(q) ||
      h.code.toLowerCase().includes(q) ||
      h.id.toLowerCase().includes(q) ||
      (h.customer_name ?? "").toLowerCase().includes(q) ||
      (h.customer_whatsapp ?? "").toLowerCase().includes(q) ||
      (h.customer_email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <PageContainer>
      {/* Hero — mesmo estilo da página do revendedor */}
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
              Emissão manual de chaves Claude pelo painel do gerente — direto no fornecedor, sem débito de carteira.
            </p>
          </div>
        </div>
      </div>

      {/* Plan picker + history */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
            <h3 className="font-display text-sm font-semibold">Escolha o plano</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {plans.map((p) => {
              const active = selected === p.plan_code;
              const badge = PLAN_BADGES[p.plan_code];
              return (
                <button
                  key={p.plan_code}
                  type="button"
                  onClick={() => setSelected(p.plan_code)}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-lg",
                    active
                      ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                      : "border-border bg-background/40 hover:border-border/80",
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                      PLAN_GRADIENTS[p.plan_code],
                      active ? "opacity-100" : "opacity-40 group-hover:opacity-70",
                    )}
                  />
                  <div className="relative flex items-start justify-between">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground",
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
                    <div className="mt-2 font-display text-base font-bold">{fmtBRL(p.cost_cents)}</div>
                    <div className="text-[10px] text-muted-foreground">custo provedor</div>
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
             E-mail do cliente <span className="text-primary">*</span>
            </Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="cliente@email.com"
                type="email"
                inputMode="email"
                required
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-6 mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">3</span>
            <h3 className="font-display text-sm font-semibold">Emitir chave</h3>
          </div>

          <Button
            onClick={issue}
            disabled={issuing !== null || !plans.length}
            size="lg"
            className="w-full relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
          >
            {issuing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><KeyRound className="mr-2 h-4 w-4" /> Gerar chave {PLAN_LABELS[selected]}</>
            )}
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Uso interno — sem débito de carteira. O custo do provedor é apenas informativo.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Chaves emitidas</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={loadUsage}
                disabled={usageLoading}
                title="Atualizar consumo de tokens"
              >
                {usageLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              <Badge variant="outline" className="text-[10px] font-bold uppercase">{history.length}</Badge>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por plano ou chave…"
              className="pl-8 h-9 text-xs"
            />
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {history.length === 0 ? "Nenhuma chave emitida ainda." : "Nenhum resultado."}
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredHistory.map((h) => (
                <div
                  key={h.id}
                  className="rounded-xl border border-border bg-background/40 p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold truncate">
                        {PLAN_LABELS[h.plan]}
                      </div>
                      {h.customer_name && (
                        <div className="mt-0.5 text-[11px] text-foreground/80 truncate flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{h.customer_name}</span>
                          {h.customer_whatsapp && (
                            <span className="text-muted-foreground">· {h.customer_whatsapp}</span>
                          )}
                        </div>
                      )}
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                        #{h.id.slice(0, 8).toUpperCase()}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                        Emitida
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                        onClick={() => cancelKey({ id: h.id, code: h.code })}
                        disabled={cancellingId === h.id}
                        title="Cancelar e estornar"
                      >
                        {cancellingId === h.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <><XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar</>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                    <span className="font-semibold text-foreground">{fmtBRL(h.cost_cents)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-background/60 p-1.5">
                    <code className="flex-1 font-mono text-[11px] truncate select-all px-1">{h.code}</code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={async () => {
                        await navigator.clipboard.writeText(h.code);
                        toast.success("Chave copiada");
                      }}
                      title="Copiar chave"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {h.api_key && (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5">
                      <span className="text-[9px] font-bold uppercase text-primary/80 shrink-0 pl-1">API</span>
                      <code className="flex-1 font-mono text-[11px] truncate select-all px-1">{h.api_key}</code>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={async () => {
                          await navigator.clipboard.writeText(h.api_key!);
                          toast.success("API Key copiada");
                        }}
                        title="Copiar API Key"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {(() => {
                    const u = usageByOrderId[h.id] ?? (h.customer_email ? usageByEmail[h.customer_email.toLowerCase()] : null);
                    if (!u) {
                      if (!usageLoaded || usageLoading) return null;
                      return (
                        <div className="mt-2 rounded-lg border border-border bg-background/60 p-2 text-[10px] text-muted-foreground">
                          Consumo ainda não localizado no provedor para esta chave.
                        </div>
                      );
                    }
                    const pctWindow = u.tokenLimit && u.tokensInWindow != null
                      ? Math.min(100, Math.round((Number(u.tokensInWindow) / Number(u.tokenLimit)) * 100))
                      : null;
                    const pctWeekly = u.weeklyTokenLimit && u.weeklyTokensInWindow != null
                      ? Math.min(100, Math.round((Number(u.weeklyTokensInWindow) / Number(u.weeklyTokenLimit)) * 100))
                      : null;
                    return (
                      <div className="mt-2 rounded-lg border border-border bg-background/60 p-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span className="flex items-center gap-1"><Activity className="h-3 w-3 text-primary" /> Consumo</span>
                          {u.status && <span className="normal-case tracking-normal">{u.status}</span>}
                        </div>
                        {pctWindow != null && (
                          <div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Janela {u.tokenWindowHours ?? 12}h</span>
                              <span className="font-mono text-foreground">
                                {fmtTokens(u.tokensInWindow)} / {fmtTokens(u.tokenLimit)} · {pctWindow}%
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pctWindow >= 90 ? "bg-rose-500" : pctWindow >= 70 ? "bg-amber-500" : "bg-emerald-500",
                                )}
                                style={{ width: `${pctWindow}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {pctWeekly != null && (
                          <div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Semanal</span>
                              <span className="font-mono text-foreground">
                                {fmtTokens(u.weeklyTokensInWindow)} / {fmtTokens(u.weeklyTokenLimit)} · {pctWeekly}%
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pctWeekly >= 90 ? "bg-rose-500" : pctWeekly >= 70 ? "bg-amber-500" : "bg-primary",
                                )}
                                style={{ width: `${pctWeekly}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {u.tokensConsumed != null && (
                          <div className="text-[10px] text-muted-foreground">
                            Total consumido: <span className="font-mono text-foreground">{fmtTokens(u.tokensConsumed)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
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
            <span>Copie agora — esta chave <strong>não será exibida novamente</strong>.</span>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-sm break-all select-all">
            {revealed?.code}
          </div>
          {revealed?.apiKey && (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                <div className="font-semibold">Entrega direta ativada 🎉</div>
                <div className="mt-1">Cliente já pode usar direto no Cursor/Cline/Claude Code:</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">API Key (ANTHROPIC_AUTH_TOKEN)</div>
                <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-xs break-all select-all">
                  {revealed.apiKey}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Base URL (ANTHROPIC_BASE_URL)</div>
                <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-xs break-all select-all">
                  {revealed.providerBaseUrl ?? "https://claude-ss.ia.br/"}
                </div>
              </div>
            </div>
          )}
          {revealed && (
            <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">Mensagem para o cliente</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyField("msg", buildClientMessage())}>
                    {copiedField === "msg" ? <><Check className="h-4 w-4 mr-1" /> Copiado</> : <><Copy className="h-4 w-4 mr-1" /> Copiar mensagem</>}
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
              {(!revealed.customerWhatsapp || revealed.customerWhatsapp.length < 10) && (
                <div className="text-[11px] text-muted-foreground">
                  Sem WhatsApp preenchido — use "Copiar mensagem" e envie manualmente.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={cancelRevealed}
              disabled={cancelling}
              className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
            >
              {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelando...</> : <>Cancelar e estornar</>}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRevealed(null)}>Fechar</Button>
              <Button onClick={copy}>
                {copied ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar chave</>}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}