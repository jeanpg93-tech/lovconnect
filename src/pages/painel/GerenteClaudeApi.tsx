import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer, PageHeader } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Tag, Users, Loader2, RefreshCw, Save, Wallet, Layers, Medal, Award, Crown, Gem, Webhook, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type PlanCode = "pro_30d" | "5x_7d" | "5x_30d" | "20x_30d" | "api_30d" | "api_500k_30d" | "api_25m_30d" | "api_10m_30d";
type MarkupMode = "percent" | "fixed_add" | "final";

const PLAN_LABELS: Record<PlanCode, string> = {
  "pro_30d": "Pro · 30 dias",
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
  "api_30d": "API · 30 dias",
  "api_500k_30d": "API 500K · 30 dias",
  "api_25m_30d": "API 2,5M · 30 dias",
  "api_10m_30d": "API 10M · 30 dias",
};
const PLAN_ORDER: PlanCode[] = ["pro_30d", "5x_7d", "5x_30d", "20x_30d", "api_30d", "api_500k_30d", "api_25m_30d", "api_10m_30d"];

type PlanPrice = {
  id: string;
  plan_code: PlanCode;
  cost_cents: number;
  markup_mode: MarkupMode;
  markup_value_cents: number;
  sale_price_cents: number;
  reseller_cost_mode: "markup" | "final";
  reseller_cost_markup_bps: number;
  reseller_cost_cents: number;
  is_active: boolean;
};

const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseBRL = (s: string) => Math.round(parseFloat(s.replace(",", ".") || "0") * 100);

function computeSale(cost: number, mode: MarkupMode, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

export default function GerenteClaudeApi() {
  const [tab, setTab] = useState("saldo");

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="API Claude" description="Saldo do fornecedor, preços de venda e revendedores habilitados." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="saldo" className="gap-2"><BarChart3 className="h-4 w-4" /> Saldo / Estoque</TabsTrigger>
          <TabsTrigger value="precos" className="gap-2"><Tag className="h-4 w-4" /> Preços</TabsTrigger>
          <TabsTrigger value="revendedores" className="gap-2"><Users className="h-4 w-4" /> Revendedores</TabsTrigger>
          <TabsTrigger value="webhook" className="gap-2"><Webhook className="h-4 w-4" /> Webhook</TabsTrigger>
        </TabsList>
        <TabsContent value="saldo" className="mt-6"><BalanceTab /></TabsContent>
        <TabsContent value="precos" className="mt-6"><PricesTab /></TabsContent>
        <TabsContent value="revendedores" className="mt-6"><ResellersTab /></TabsContent>
        <TabsContent value="webhook" className="mt-6"><WebhookTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function BalanceTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    const { data, error, skipped } = await invokeAuthenticatedFunction("claude-api", { method: "GET" });
    setLoading(false);
    if (skipped) return setError("Sessão expirada");
    if (error) {
      const msg = (data as any)?.error ?? (error as any)?.message ?? "Erro ao consultar fornecedor";
      return setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    setData(data);
  };
  useEffect(() => { load(); }, []);

  // Pega o "payload" real (alguns provedores embrulham em { data: {...} })
  const payload: any = data?.data && typeof data.data === "object" ? data.data : data;

  // Campos brutos que não devem aparecer aqui (gerenciados em outras abas)
  const HIDDEN_KEYS = new Set(["prices", "plans", "plan_prices"]);
  const scalarEntries: Array<[string, any]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(([k, v]) => !HIDDEN_KEYS.has(k) && (v === null || ["string", "number", "boolean"].includes(typeof v)))
    : [];
  const arrayEntries: Array<[string, any[]]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(([k, v]) => !HIDDEN_KEYS.has(k) && Array.isArray(v)) as Array<[string, any[]]>
    : [];
  const objectEntries: Array<[string, Record<string, any>]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(
        ([k, v]) => !HIDDEN_KEYS.has(k) && v && typeof v === "object" && !Array.isArray(v),
      ) as Array<[string, Record<string, any>]>
    : [];

  const FIELD_LABELS: Record<string, string> = {
    balance: "Saldo disponível",
    available_balance: "Saldo disponível",
    availableBalance: "Saldo disponível",
    blocked_balance: "Saldo bloqueado",
    blockedBalance: "Saldo bloqueado",
    credits: "Créditos",
    stock: "Estoque",
    email: "E-mail",
    name: "Nome",
    username: "Usuário",
    plan: "Plano",
  };
  const isMoneyField = (k: string) =>
    /balance|saldo|valor|price|preco|preço|cost|custo|amount/i.test(k) ||
    /^(\d+x_)?\d+d$/i.test(k) || // chaves de plano estilo "5x_7d", "20x_30d"
    /^pro_/i.test(k) ||
    /^api(_|$)/i.test(k); // chaves de plano de API: "api_30d", "api_500k_30d", etc.
  const fmt = (k: string, v: any) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (typeof v === "number" && isMoneyField(k)) {
      // Fornecedor devolve valores monetários em centavos
      return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
    return String(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {!error && loading && !data && (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      )}
      {!error && data && (
        <>
          {scalarEntries.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scalarEntries.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                    {FIELD_LABELS[k] ?? k}
                  </div>
                  <div className="mt-1 font-display text-xl font-semibold tabular-nums">
                    {fmt(k, v)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {arrayEntries.map(([k, arr]) => (
            <div key={k} className="rounded-xl border border-border bg-card/60 p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                {FIELD_LABELS[k] ?? k} <Badge variant="secondary">{arr.length}</Badge>
              </div>
              <div className="space-y-2">
                {arr.map((item, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                    {typeof item === "object" && item !== null ? (
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {Object.entries(item).map(([ik, iv]) => (
                          <div key={ik} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{FIELD_LABELS[ik] ?? ik}</span>
                            <span className="font-medium tabular-nums">{fmt(ik, iv)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      String(item)
                    )}
                  </div>
                ))}
                {arr.length === 0 && <div className="text-sm text-muted-foreground">Vazio.</div>}
              </div>
            </div>
          ))}
          {objectEntries.map(([k, obj]) => (
            <div key={k} className="rounded-xl border border-border bg-card/60 p-5">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                {FIELD_LABELS[k] ?? k}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(obj).map(([ik, iv]) => (
                  <div key={ik} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                    <span className="text-muted-foreground">{FIELD_LABELS[ik] ?? ik}</span>
                    <span className="font-semibold tabular-nums">{fmt(ik, iv)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <details className="rounded-xl border border-border bg-card/40 p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver resposta bruta do fornecedor</summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-background/60 p-3">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

function WebhookTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const register = async () => {
    setLoading(true);
    setResult(null);
    const { data, error } = await invokeAuthenticatedFunction<any>("claude-register-webhook", { method: "POST", body: {} });
    setLoading(false);
    if (error && !data) { toast.error("Falha ao registrar webhook"); return; }
    setResult(data);
    if (data?.ok) toast.success("Webhook registrado no fornecedor");
    else toast.error("Fornecedor recusou o registro");
  };

  const webhookKey: string | null =
    result?.provider_response?.webhookKey ??
    result?.provider_response?.data?.webhookKey ??
    result?.provider_response?.secret ?? null;

  const copy = async () => {
    if (!webhookKey) return;
    try { await navigator.clipboard.writeText(webhookKey); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Webhook className="h-4 w-4" /> Registrar webhook no fornecedor</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Chama <code>POST /api/rsl/webhooks</code> e assina os eventos: <code>key.created</code>, <code>key.redeemed</code>, <code>key.cancelled</code>, <code>key.expired</code>, <code>tokens.limit_reached</code>.
            </p>
          </div>
          <Button onClick={register} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
            Registrar
          </Button>
        </div>
        {result?.webhook_url && (
          <div className="text-xs text-muted-foreground break-all">URL: <code>{result.webhook_url}</code></div>
        )}
        {webhookKey && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
            <div className="text-sm font-medium text-amber-600 dark:text-amber-400">webhookKey retornado — salve em CLAUDE_PROVIDER_WEBHOOK_SECRET</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{webhookKey}</code>
              <Button size="sm" variant="outline" onClick={copy} className="gap-1">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        )}
        {result && !result.ok && (
          <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-3 max-h-64 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

function PricesTab() {
  const [rows, setRows] = useState<PlanPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("admin_claude_plan_prices_full");
    const ordered = PLAN_ORDER
      .map((pc) => (data ?? []).find((d: any) => d.plan_code === pc))
      .filter(Boolean) as PlanPrice[];
    setRows(ordered);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const syncFromProvider = async () => {
    setSyncing(true);
    try {
      const { data, error } = await invokeAuthenticatedFunction("claude-api", { method: "GET" });
      if (error) throw new Error((data as any)?.error ?? (error as any)?.message ?? "Erro ao consultar fornecedor");
      const payload: any = (data as any)?.data && typeof (data as any).data === "object" ? (data as any).data : data;
      const prices = payload?.prices;
      if (!prices || typeof prices !== "object") throw new Error("Resposta do fornecedor não contém 'prices'");

      // Mapeamento conforme confirmado com o fornecedor:
      //  pro_30d  → 500K tokens / 24h  · 30 dias (desativado no painel se necessário)
      //  5x_7d    → 1.25M tokens / 12h · 7 dias  (DESATIVADO — não revendemos)
      //  5x_30d   → 1.25M tokens / 12h · 30 dias
      //  20x_30d  → 5M    tokens / 12h · 30 dias
      const API_KEY_MAP: Record<PlanCode, string[]> = {
        "pro_30d": ["api_500k_30d", "api_300k_30d", "api_500k", "api_300k", "pro_30d"],
        "5x_7d":   ["api_1_25m_7d", "api_1.25m_7d", "api_1_25m", "api_1.25m", "5x_7d"],
        "5x_30d":  ["api_1_25m_30d", "api_1.25m_30d", "5x_30d"],
        "20x_30d": ["api_5m_30d", "api_5m", "20x_30d"],
        "api_500k_30d": ["api_500k_30d"],
        "api_25m_30d":  ["api_25m_30d", "api_2_5m_30d", "api_2.5m_30d"],
        "api_10m_30d":  ["api_10m_30d"],
      };
      const pickApi = (pc: PlanCode): number | null => {
        for (const k of API_KEY_MAP[pc]) {
          const v = Number((prices as any)[k]);
          if (Number.isFinite(v)) return v;
        }
        return null;
      };

      const updates = PLAN_ORDER
        .map((pc) => {
          const raw = pickApi(pc);
          if (raw == null) return null;
          const row = rows.find((r) => r.plan_code === pc);
          if (!row) return null;
          // Conforme doc atualizada do fornecedor, `prices` já vem em CENTAVOS
          // (ex.: 9000 = R$ 90,00). Apenas garantimos inteiro.
          const cost = Math.round(raw);
          const sale = computeSale(cost, row.markup_mode, row.markup_value_cents);
          return { id: row.id, cost_cents: cost, sale_price_cents: sale };
        })
        .filter(Boolean) as Array<{ id: string; cost_cents: number; sale_price_cents: number }>;

      if (updates.length === 0) throw new Error("Nenhum preço de API encontrado na resposta do fornecedor");

      for (const u of updates) {
        await supabase
          .from("claude_plan_prices")
          .update({ cost_cents: u.cost_cents, sale_price_cents: u.sale_price_cents })
          .eq("id", u.id);
      }
      toast.success(`${updates.length} custo(s) sincronizado(s) do fornecedor`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={syncFromProvider} disabled={syncing}>
          {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Sincronizar custos do fornecedor
        </Button>
      </div>

      <TierMatrix plans={rows.filter((r) => r.is_active)} />
    </div>
  );
}

type TierRow = {
  tier_id: string;
  tier_name: string;
  tier_sort_order: number;
  plan_code: PlanCode;
  reseller_cost_cents: number;
  is_active: boolean;
};

function TierMatrix({ plans }: { plans: PlanPrice[] }) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<TierRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Modo de entrada por nível: "brl" (R$ absoluto) ou "pct" (% sobre custo)
  const [tierMode, setTierMode] = useState<Record<string, "brl" | "pct">>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_tier_claude_prices_matrix");
    if (error) { toast.error(error.message); setLoading(false); return; }
    setMatrix((data ?? []) as TierRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tiers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sort: number }>();
    matrix.forEach((m) => {
      if (!map.has(m.tier_id)) map.set(m.tier_id, { id: m.tier_id, name: m.tier_name, sort: m.tier_sort_order });
    });
    return Array.from(map.values()).sort((a, b) => a.sort - b.sort);
  }, [matrix]);

  const getCell = (tierId: string, planCode: PlanCode) =>
    matrix.find((m) => m.tier_id === tierId && m.plan_code === planCode);

  const tierStyle = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("bronze")) return { Icon: Medal, color: "#cd7f32", bg: "rgba(205,127,50,0.10)", border: "rgba(205,127,50,0.35)" };
    if (n.includes("prata") || n.includes("silver")) return { Icon: Award, color: "#c0c5ce", bg: "rgba(192,197,206,0.10)", border: "rgba(192,197,206,0.35)" };
    if (n.includes("ouro") || n.includes("gold")) return { Icon: Crown, color: "#f5c542", bg: "rgba(245,197,66,0.12)", border: "rgba(245,197,66,0.40)" };
    if (n.includes("partner") || n.includes("diamond") || n.includes("platinum")) return { Icon: Gem, color: "#22c55e", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.40)" };
    return { Icon: Layers, color: "hsl(var(--primary))", bg: "hsl(var(--primary) / 0.08)", border: "hsl(var(--primary) / 0.35)" };
  };

  const keyOf = (tierId: string, planCode: string) => `${tierId}:${planCode}`;

  const save = async (tierId: string, planCode: PlanCode) => {
    const k = keyOf(tierId, planCode);
    const raw = drafts[k];
    if (raw == null) return;
    const plan = plans.find((p) => p.plan_code === planCode);
    const mode = tierMode[tierId] ?? "brl";
    let cents = 0;
    if (mode === "pct") {
      const pct = parseFloat(raw.replace(",", ".")) || 0;
      if (!plan) return toast.error("Plano não encontrado");
      cents = Math.round(plan.cost_cents * (1 + pct / 100));
    } else {
      cents = parseBRL(raw);
    }
    if (cents <= 0) return toast.error("Valor inválido");
    if (plan && cents < plan.cost_cents) {
      return toast.error(`Abaixo do seu custo (${fmtBRL(plan.cost_cents)})`);
    }
    setSavingKey(k);
    const { error } = await supabase
      .from("tier_claude_prices")
      .upsert(
        { tier_id: tierId, plan_code: planCode, reseller_cost_cents: cents, is_active: true },
        { onConflict: "tier_id,plan_code" },
      );
    setSavingKey(null);
    if (error) return toast.error(error.message);
    setMatrix((prev) => {
      const idx = prev.findIndex((m) => m.tier_id === tierId && m.plan_code === planCode);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], reseller_cost_cents: cents, is_active: true };
        return copy;
      }
      const t = tiers.find((t) => t.id === tierId);
      return [...prev, { tier_id: tierId, tier_name: t?.name ?? "", tier_sort_order: t?.sort ?? 0, plan_code: planCode, reseller_cost_cents: cents, is_active: true }];
    });
    setDrafts((d) => { const c = { ...d }; delete c[k]; return c; });
    toast.success("Preço salvo");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-3">
        <Layers className="h-4 w-4 text-primary" />
        <div className="font-display font-semibold">Preços por nível</div>
        <Badge variant="secondary" className="ml-auto">{tiers.length} níveis</Badge>
      </div>

      {/* Desktop matrix */}
      {!isMobile && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Plano</th>
                <th className="px-3 py-2 text-right">Meu custo</th>
                {tiers.map((t) => {
                  const s = tierStyle(t.name);
                  const mode = tierMode[t.id] ?? "brl";
                  return (
                    <th key={t.id} className="px-3 py-2 text-center" style={{ color: s.color }}>
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <s.Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
                          {t.name}
                        </span>
                        <div className="inline-flex rounded-md border border-border/60 p-0.5">
                          <button
                            type="button"
                            onClick={() => { setTierMode((m) => ({ ...m, [t.id]: "brl" })); setDrafts({}); }}
                            className={`px-1.5 py-0.5 text-[10px] rounded ${mode === "brl" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                          >R$</button>
                          <button
                            type="button"
                            onClick={() => { setTierMode((m) => ({ ...m, [t.id]: "pct" })); setDrafts({}); }}
                            className={`px-1.5 py-0.5 text-[10px] rounded ${mode === "pct" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                          >%</button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.plan_code} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-display font-semibold">{PLAN_LABELS[p.plan_code]}</div>
                    <div className="text-[11px] text-muted-foreground">{p.is_active ? "Ativo" : "Inativo"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-display tabular-nums font-semibold">{fmtBRL(p.cost_cents)}</div>
                  </td>
                  {tiers.map((t) => {
                    const cell = getCell(t.id, p.plan_code);
                    const k = keyOf(t.id, p.plan_code);
                    const draftVal = drafts[k];
                    const currentCents = cell?.reseller_cost_cents ?? 0;
                    const mode = tierMode[t.id] ?? "brl";
                    const draftCents = draftVal != null
                      ? (mode === "pct"
                          ? Math.round(p.cost_cents * (1 + (parseFloat(draftVal.replace(",", ".")) || 0) / 100))
                          : parseBRL(draftVal))
                      : currentCents;
                    const profit = draftCents - p.cost_cents;
                    const s = tierStyle(t.name);
                    const placeholderTxt = mode === "pct" ? "30" : "0,00";
                    const displayVal = draftVal ?? (mode === "brl"
                      ? (currentCents ? (currentCents / 100).toFixed(2).replace(".", ",") : "")
                      : (currentCents && p.cost_cents ? (((currentCents - p.cost_cents) / p.cost_cents) * 100).toFixed(2).replace(".", ",") : ""));
                    return (
                      <td key={t.id} className="px-2 py-2 text-center align-top" style={{ background: s.bg }}>
                        <div className="relative">
                          <Input
                            value={displayVal}
                            onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                            placeholder={placeholderTxt}
                            className="h-8 text-center tabular-nums pr-6"
                            style={{ borderColor: s.border }}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                            {mode === "pct" ? "%" : "R$"}
                          </span>
                        </div>
                        <div className={`mt-1 text-[10px] tabular-nums ${profit > 0 ? "text-emerald-500" : profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {mode === "pct" ? `≈ ${fmtBRL(draftCents)} · Lucro: ${fmtBRL(profit)}` : `Lucro: ${fmtBRL(profit)}`}
                        </div>
                        {draftVal != null && draftVal !== "" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-6 px-2 text-[11px]"
                            disabled={savingKey === k}
                            onClick={() => save(t.id, p.plan_code)}
                          >
                            {savingKey === k ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: card per plan with tier list */}
      {isMobile && (
        <div className="divide-y divide-border">
          {plans.map((p) => (
            <div key={p.plan_code} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <div className="font-display font-semibold">{PLAN_LABELS[p.plan_code]}</div>
                  <div className="text-[11px] text-muted-foreground">Meu custo</div>
                </div>
                <div className="font-display text-base font-bold tabular-nums">{fmtBRL(p.cost_cents)}</div>
              </div>
              <div className="space-y-2">
                {tiers.map((t) => {
                  const cell = getCell(t.id, p.plan_code);
                  const k = keyOf(t.id, p.plan_code);
                  const draftVal = drafts[k];
                  const currentCents = cell?.reseller_cost_cents ?? 0;
                  const mode = tierMode[t.id] ?? "brl";
                  const draftCents = draftVal != null
                    ? (mode === "pct"
                        ? Math.round(p.cost_cents * (1 + (parseFloat(draftVal.replace(",", ".")) || 0) / 100))
                        : parseBRL(draftVal))
                    : currentCents;
                  const profit = draftCents - p.cost_cents;
                  const displayVal = draftVal ?? (mode === "brl"
                    ? (currentCents ? (currentCents / 100).toFixed(2).replace(".", ",") : "")
                    : (currentCents && p.cost_cents ? (((currentCents - p.cost_cents) / p.cost_cents) * 100).toFixed(2).replace(".", ",") : ""));
                  return (
                    <div key={t.id} className="rounded-lg border p-2.5" style={{ background: tierStyle(t.name).bg, borderColor: tierStyle(t.name).border }}>
                      <div className="mb-1.5 flex items-center justify-between">
                        {(() => { const s = tierStyle(t.name); return (
                          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, borderColor: s.border }}>
                            <s.Icon className="h-3 w-3" />
                            {t.name}
                          </span>
                        ); })()}
                        <div className="flex items-center gap-2">
                          <div className="inline-flex rounded-md border border-border/60 p-0.5">
                            <button type="button" onClick={() => { setTierMode((m) => ({ ...m, [t.id]: "brl" })); setDrafts({}); }} className={`px-1.5 py-0.5 text-[10px] rounded ${mode === "brl" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>R$</button>
                            <button type="button" onClick={() => { setTierMode((m) => ({ ...m, [t.id]: "pct" })); setDrafts({}); }} className={`px-1.5 py-0.5 text-[10px] rounded ${mode === "pct" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>%</button>
                          </div>
                          <span className={`text-[11px] tabular-nums ${profit > 0 ? "text-emerald-500" : profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            Lucro: {fmtBRL(profit)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{mode === "pct" ? "%" : "R$"}</span>
                        <Input
                          value={displayVal}
                          onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                          placeholder={mode === "pct" ? "30" : "0,00"}
                          className="h-8 tabular-nums"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          disabled={savingKey === k || draftVal == null}
                          onClick={() => save(t.id, p.plan_code)}
                        >
                          {savingKey === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceCard({ row, onSaved }: { row: PlanPrice; onSaved: (r: PlanPrice) => void }) {
  const [cost, setCost] = useState((row.cost_cents / 100).toFixed(2).replace(".", ","));
  const [mode, setMode] = useState<MarkupMode>(row.markup_mode);
  const [val, setVal] = useState(
    row.markup_mode === "percent"
      ? (row.markup_value_cents / 100).toFixed(2).replace(".", ",")
      : (row.markup_value_cents / 100).toFixed(2).replace(".", ","),
  );
  const [active, setActive] = useState(row.is_active);
  const [saving, setSaving] = useState(false);
  // Custo cobrado do revendedor (definido pelo gerente)
  const [rcMode, setRcMode] = useState<"markup" | "final">(row.reseller_cost_mode ?? "final");
  const [rcVal, setRcVal] = useState(
    (row.reseller_cost_mode ?? "final") === "markup"
      ? ((row.reseller_cost_markup_bps ?? 0) / 100).toFixed(2).replace(".", ",")
      : ((row.reseller_cost_cents ?? row.sale_price_cents) / 100).toFixed(2).replace(".", ","),
  );

  const costCents = parseBRL(cost);
  const valueCents = mode === "percent" ? Math.round(parseFloat(val.replace(",", ".") || "0") * 100) : parseBRL(val);
  const sale = useMemo(() => computeSale(costCents, mode, valueCents), [costCents, mode, valueCents]);
  const profit = sale - costCents;
  // Custo final cobrado do revendedor
  const rcMarkupBps = rcMode === "markup" ? Math.round(parseFloat(rcVal.replace(",", ".") || "0") * 100) : 0;
  const rcFinalCents = rcMode === "final" ? parseBRL(rcVal) : 0;
  const resellerCostCents = useMemo(() => {
    if (rcMode === "markup") return Math.max(0, Math.round((costCents * (10000 + rcMarkupBps)) / 10000));
    return Math.max(0, rcFinalCents);
  }, [rcMode, costCents, rcMarkupBps, rcFinalCents]);
  const managerProfit = resellerCostCents - costCents;

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("claude_plan_prices").update({
      cost_cents: costCents,
      markup_mode: mode,
      markup_value_cents: valueCents,
      sale_price_cents: sale,
      reseller_cost_mode: rcMode,
      reseller_cost_markup_bps: rcMarkupBps,
      reseller_cost_cents: resellerCostCents,
      is_active: active,
    }).eq("id", row.id).select("id, plan_code, markup_mode, markup_value_cents, sale_price_cents, reseller_cost_mode, reseller_cost_markup_bps, is_active, sort_order").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Preço salvo");
    // repõe cost_cents/reseller_cost_cents locais (não vieram do SELECT por restrição de coluna)
    onSaved({ ...(data as any), cost_cents: costCents, reseller_cost_cents: resellerCostCents } as PlanPrice);
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-display font-semibold">{PLAN_LABELS[row.plan_code]}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={active} onCheckedChange={setActive} /> Ativo
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Custo (R$)</Label>
          <Input value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Modo de markup</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as MarkupMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">% sobre o custo</SelectItem>
              <SelectItem value="fixed_add">R$ adicional fixo</SelectItem>
              <SelectItem value="final">Preço final em R$</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{mode === "percent" ? "Markup (%)" : mode === "fixed_add" ? "Adicional (R$)" : "Preço final (R$)"}</Label>
          <Input value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preço sugerido (revendedor)</Label>
          <div className="flex h-9 items-center rounded-md border border-border bg-background/40 px-3 text-sm font-semibold">
            {fmtBRL(sale)}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 text-[11px] font-mono uppercase tracking-wider text-primary">
          Custo cobrado do revendedor
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Modo</Label>
            <Select value={rcMode} onValueChange={(v) => setRcMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="markup">% sobre custo</SelectItem>
                <SelectItem value="final">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{rcMode === "markup" ? "Markup (%)" : "Valor final (R$)"}</Label>
            <Input value={rcVal} onChange={(e) => setRcVal(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cobrado do revendedor</Label>
            <div className="flex h-9 items-center rounded-md border border-primary/40 bg-background/40 px-3 text-sm font-semibold text-primary">
              {fmtBRL(resellerCostCents)}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Seu lucro por chave: <span className={managerProfit >= 0 ? "text-emerald-500" : "text-destructive"}>{fmtBRL(managerProfit)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Lucro estimado: <span className={profit >= 0 ? "text-emerald-500" : "text-destructive"}>{fmtBRL(profit)}</span></span>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

function ResellersTab() {
  const [list, setList] = useState<Array<{ id: string; display_name: string; claude_enabled: boolean; claude_tier_override_id: string | null }>>([]);
  const [tiers, setTiers] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: t }] = await Promise.all([
        supabase.from("resellers").select("id,display_name,claude_enabled,claude_tier_override_id").order("display_name"),
        supabase.from("reseller_tiers").select("id,name,color,sort_order,is_active").eq("is_active", true).order("sort_order"),
      ]);
      setList((data ?? []) as any);
      setTiers(((t ?? []) as any[]).map((x) => ({ id: x.id, name: x.name, color: x.color })));
      setLoading(false);
    })();
  }, []);

  const filtered = list.filter((r) => r.display_name?.toLowerCase().includes(q.toLowerCase()));

  const toggle = async (id: string, value: boolean) => {
    setList((prev) => prev.map((r) => r.id === id ? { ...r, claude_enabled: value } : r));
    const { error } = await supabase.from("resellers").update({ claude_enabled: value }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setList((prev) => prev.map((r) => r.id === id ? { ...r, claude_enabled: !value } : r));
    } else {
      toast.success(value ? "Claude habilitado" : "Claude desabilitado");
    }
  };

  const allEnabled = list.length > 0 && list.every((r) => r.claude_enabled);

  const toggleAll = async (value: boolean) => {
    setBulkBusy(true);
    const prev = list;
    setList((p) => p.map((r) => ({ ...r, claude_enabled: value })));
    const { error } = await supabase
      .from("resellers")
      .update({ claude_enabled: value })
      .not("id", "is", null);
    setBulkBusy(false);
    if (error) {
      toast.error(error.message);
      setList(prev);
    } else {
      toast.success(value ? "Claude habilitado para todos" : "Claude desabilitado para todos");
    }
  };

  const setOverride = async (id: string, tierId: string | null) => {
    const prev = list;
    setList((p) => p.map((r) => r.id === id ? { ...r, claude_tier_override_id: tierId } : r));
    const { error } = await supabase.from("resellers").update({ claude_tier_override_id: tierId }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setList(prev);
    } else {
      toast.success(tierId ? "Nível de Claude alterado para esse revendedor" : "Nível de Claude voltou ao padrão");
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div>
          <div className="text-sm font-semibold">Habilitar Claude para todos os revendedores</div>
          <div className="text-xs text-muted-foreground">Ativa ou desativa a venda de Claude em massa ({list.length} revendedores).</div>
        </div>
        <div className="flex items-center gap-2">
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Switch checked={allEnabled} disabled={bulkBusy} onCheckedChange={toggleAll} />
        </div>
      </div>
      <Input placeholder="Buscar revendedor..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="rounded-xl border border-border bg-card/60 divide-y divide-border">
        {filtered.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-medium truncate">{r.display_name}</span>
              {r.claude_enabled && <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">Habilitado</Badge>}
              {r.claude_tier_override_id && (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-500 gap-1">
                  <Crown className="h-3 w-3" /> Nível customizado
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Nível Claude</Label>
                <Select
                  value={r.claude_tier_override_id ?? "__default__"}
                  onValueChange={(v) => setOverride(r.id, v === "__default__" ? null : v)}
                  disabled={!r.claude_enabled}
                >
                  <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Usar nível padrão</SelectItem>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Switch checked={r.claude_enabled} onCheckedChange={(v) => toggle(r.id, v)} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum revendedor encontrado.</div>}
      </div>
    </div>
  );
}