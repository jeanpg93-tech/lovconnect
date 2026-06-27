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
import { BarChart3, Tag, Users, Loader2, RefreshCw, Save, Wallet } from "lucide-react";
import { toast } from "sonner";

type PlanCode = "5x_7d" | "5x_30d" | "20x_30d" | "pro_30d";
type MarkupMode = "percent" | "fixed_add" | "final";

const PLAN_LABELS: Record<PlanCode, string> = {
  "5x_7d": "5x_7d",
  "5x_30d": "5x_30d",
  "20x_30d": "20x_30d",
  "pro_30d": "pro_30d",
};
const PLAN_ORDER: PlanCode[] = ["5x_7d", "5x_30d", "20x_30d", "pro_30d"];

type PlanPrice = {
  id: string;
  plan_code: PlanCode;
  cost_cents: number;
  markup_mode: MarkupMode;
  markup_value_cents: number;
  sale_price_cents: number;
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
        </TabsList>
        <TabsContent value="saldo" className="mt-6"><BalanceTab /></TabsContent>
        <TabsContent value="precos" className="mt-6"><PricesTab /></TabsContent>
        <TabsContent value="revendedores" className="mt-6"><ResellersTab /></TabsContent>
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

  const scalarEntries: Array<[string, any]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))
    : [];
  const arrayEntries: Array<[string, any[]]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(([, v]) => Array.isArray(v)) as Array<[string, any[]]>
    : [];
  const objectEntries: Array<[string, Record<string, any>]> = payload && typeof payload === "object"
    ? Object.entries(payload).filter(
        ([, v]) => v && typeof v === "object" && !Array.isArray(v),
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
                    {FIELD_LABELS[k] ?? k.replace(/_/g, " ")}
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
                {FIELD_LABELS[k] ?? k.replace(/_/g, " ")} <Badge variant="secondary">{arr.length}</Badge>
              </div>
              <div className="space-y-2">
                {arr.map((item, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                    {typeof item === "object" && item !== null ? (
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {Object.entries(item).map(([ik, iv]) => (
                          <div key={ik} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{FIELD_LABELS[ik] ?? ik.replace(/_/g, " ")}</span>
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
                {FIELD_LABELS[k] ?? k.replace(/_/g, " ")}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(obj).map(([ik, iv]) => (
                  <div key={ik} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                    <span className="text-muted-foreground">{FIELD_LABELS[ik] ?? ik.replace(/_/g, " ")}</span>
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

function PricesTab() {
  const [rows, setRows] = useState<PlanPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("claude_plan_prices").select("*");
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

      const updates = PLAN_ORDER
        .map((pc) => {
          const cost = Number(prices[pc]);
          if (!Number.isFinite(cost)) return null;
          const row = rows.find((r) => r.plan_code === pc);
          if (!row) return null;
          const sale = computeSale(cost, row.markup_mode, row.markup_value_cents);
          return { id: row.id, cost_cents: cost, sale_price_cents: sale };
        })
        .filter(Boolean) as Array<{ id: string; cost_cents: number; sale_price_cents: number }>;

      if (updates.length === 0) throw new Error("Nenhum plano correspondente encontrado");

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
      {rows.map((r) => (
        <PriceCard
          key={`${r.id}:${r.cost_cents}:${r.sale_price_cents}:${r.markup_mode}:${r.markup_value_cents}`}
          row={r}
          onSaved={(u) => setRows((rs) => rs.map((x) => x.id === u.id ? u : x))}
        />
      ))}
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

  const costCents = parseBRL(cost);
  const valueCents = mode === "percent" ? Math.round(parseFloat(val.replace(",", ".") || "0") * 100) : parseBRL(val);
  const sale = useMemo(() => computeSale(costCents, mode, valueCents), [costCents, mode, valueCents]);
  const profit = sale - costCents;

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.from("claude_plan_prices").update({
      cost_cents: costCents,
      markup_mode: mode,
      markup_value_cents: valueCents,
      sale_price_cents: sale,
      is_active: active,
    }).eq("id", row.id).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Preço salvo");
    onSaved(data as PlanPrice);
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
          <Label className="text-xs">Preço de venda</Label>
          <div className="flex h-9 items-center rounded-md border border-border bg-background/40 px-3 text-sm font-semibold">
            {fmtBRL(sale)}
          </div>
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
  const [list, setList] = useState<Array<{ id: string; display_name: string; claude_enabled: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("resellers").select("id,display_name,claude_enabled").order("display_name");
      setList((data ?? []) as any);
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

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Input placeholder="Buscar revendedor..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="rounded-xl border border-border bg-card/60 divide-y divide-border">
        {filtered.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">{r.display_name}</span>
              {r.claude_enabled && <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">Habilitado</Badge>}
            </div>
            <Switch checked={r.claude_enabled} onCheckedChange={(v) => toggle(r.id, v)} />
          </div>
        ))}
        {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum revendedor encontrado.</div>}
      </div>
    </div>
  );
}