import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import {
  Loader2, Copy, Save, Trash2, AlertCircle, BookOpen, Sparkles, AlertTriangle,
  Server, Users, Search, ShieldOff, CheckCircle2, XCircle, Clock,
  LayoutDashboard, Plug, Hand, KeyRound,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function DocBlock({ title, body }: { title: string; body: string }) {
  const onCopy = () => {
    navigator.clipboard.writeText(body);
    toast.success("Copiado");
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-xs">
          <Copy className="mr-1 h-3 w-3" /> Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{body}
      </pre>
    </div>
  );
}

function Placeholder({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <Card className="border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground">{description}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* PROVEDOR — chave mestre + aviso                                     */
/* ------------------------------------------------------------------ */
type Settings = {
  configured: boolean;
  api_key_masked?: string;
  updated_at?: string;
};

function ProvedorConfig() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertEta, setAlertEta] = useState<string>("");
  const [savingAlert, setSavingAlert] = useState(false);

  const call = async (action: string, opts?: { method?: "GET" | "POST"; body?: any }) => {
    try {
      const { data, error } = await invokeAuthenticatedFunction(`lovable-credits-api?action=${action}`, {
        method: opts?.method ?? "GET",
        body: opts?.body,
      });
      if (error || data?.error) return null;
      return data;
    } catch { return null; }
  };

  const loadSettings = async () => {
    const s = await call("admin-get-settings");
    setSettings(s ?? { configured: false });
    setLoading(false);
  };
  const loadAlert = async () => {
    const a = await call("admin-get-alert");
    if (a) {
      setAlertEnabled(!!a.enabled);
      setAlertMessage(a.message ?? "");
      setAlertEta(a.eta_minutes != null ? String(a.eta_minutes) : "");
    }
  };
  useEffect(() => { loadSettings(); loadAlert(); }, []);

  const saveSettings = async () => {
    if (!apiKeyInput.trim()) return toast.error("Informe a API key");
    setSavingSettings(true);
    try {
      const r = await call("admin-save-settings", { method: "POST", body: { api_key: apiKeyInput.trim() } });
      if (!r) throw new Error("Falha ao salvar");
      toast.success("Chave mestre salva");
      setApiKeyInput("");
      await loadSettings();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally { setSavingSettings(false); }
  };

  const removeSettings = async () => {
    if (!confirm("Remover chave mestre?")) return;
    const r = await call("admin-delete-settings", { method: "POST" });
    if (r) { toast.success("Chave removida"); setSettings({ configured: false }); }
    else toast.error("Erro ao remover");
  };

  const saveAlert = async () => {
    setSavingAlert(true);
    try {
      const r = await call("admin-save-alert", {
        method: "POST",
        body: {
          enabled: alertEnabled,
          message: alertMessage.trim(),
          eta_minutes: alertEta ? Number(alertEta) : null,
        },
      });
      if (!r) throw new Error("Falha ao salvar");
      toast.success(alertEnabled ? "Aviso ativado" : "Aviso desativado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar aviso");
    } finally { setSavingAlert(false); }
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {settings && !settings.configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
          <div>
            <div className="font-medium text-amber-600 dark:text-amber-400">Provedor não configurado</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cole sua API key do Lovable Credits abaixo para habilitar as recargas automáticas.
            </p>
          </div>
        </div>
      )}

      <Card className="border-border bg-card/60 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold">Chave mestre do provedor</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Armazenada com segurança no backend, usada para todas as chamadas ao Lovable Credits.
        </p>

        {settings?.configured && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono uppercase tracking-wider text-muted-foreground">Chave atual</div>
                <div className="mt-1 font-mono">{settings.api_key_masked}</div>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={removeSettings}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
              </Button>
            </div>
            {settings.updated_at && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Atualizada em {new Date(settings.updated_at).toLocaleString("pt-BR")}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 space-y-1.5">
          <Label>API Key Lovable Credits</Label>
          <Input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="X-API-Key do Lovable Credits" />
        </div>

        <Button onClick={saveSettings} disabled={savingSettings} className="mt-5">
          {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Salvar chave mestre</>}
        </Button>
      </Card>

      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card/60 to-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Aviso de lentidão do provedor</h3>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Quando ativado, exibe um banner em todas as páginas públicas de recargas.
              </p>
            </div>
          </div>
          <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr,160px]">
          <div className="space-y-1.5">
            <Label>Mensagem exibida ao cliente</Label>
            <Textarea value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)} placeholder="Ex: Estamos com lentidão no provedor..." rows={3} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Tempo estimado (min)</Label>
            <Input type="number" min={1} value={alertEta} onChange={(e) => setAlertEta(e.target.value)} placeholder="Ex: 30" />
          </div>
        </div>

        <Button onClick={saveAlert} disabled={savingAlert} className="mt-5 bg-amber-500 text-zinc-950 hover:bg-amber-500/90">
          {savingAlert ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Salvar aviso</>}
        </Button>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* REVENDEDORES — listagem chaves                                      */
/* ------------------------------------------------------------------ */
type ResellerKeyRow = {
  id: string;
  reseller_id: string;
  label: string | null;
  key_prefix: string;
  is_active: boolean;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  reseller?: { display_name: string | null; slug: string | null } | null;
};

function RevendedoresKeys({ scope = "recharges" }: { scope?: "recharges" | "recharges_manual" } = {}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ResellerKeyRow[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reseller_api_keys")
      .select("id, reseller_id, label, key_prefix, is_active, scope, created_at, last_used_at, revoked_at, reseller:resellers(display_name, slug)")
      .eq("scope", scope)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar chaves");
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [scope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (!showInactive && !r.is_active) return false;
      if (!q) return true;
      const name = r.reseller?.display_name?.toLowerCase() ?? "";
      return name.includes(q) || r.key_prefix.toLowerCase().includes(q);
    });
  }, [rows, search, showInactive]);

  const revoke = async (id: string) => {
    if (!confirm("Revogar esta chave? O revendedor precisará gerar uma nova.")) return;
    setRevoking(id);
    const { error } = await supabase
      .from("reseller_api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", id);
    setRevoking(null);
    if (error) return toast.error("Erro ao revogar");
    toast.success("Chave revogada");
    load();
  };

  const activeCount = rows.filter(r => r.is_active).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Chaves ativas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-2xl font-bold">{activeCount}</div>
        </Card>
        <Card className="border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Revogadas</span>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-1.5 text-2xl font-bold">{rows.length - activeCount}</div>
        </Card>
        <Card className="border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Total emitidas</span>
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-1.5 text-2xl font-bold">{rows.length}</div>
        </Card>
      </div>

      <Card className="border-border bg-card/60 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por revendedor ou prefixo..." className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar revogadas
          </label>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma chave encontrada.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Revendedor</th>
                <th className="px-4 py-3 text-left">Prefixo</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-left">Último uso</th>
                <th className="px-4 py-3 text-left">Criada</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.reseller?.display_name ?? "—"}</div>
                    {r.reseller?.slug && <div className="text-[11px] text-muted-foreground">{r.reseller.slug}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.key_prefix}…</td>
                  <td className="px-4 py-3 text-center">
                    {r.is_active
                      ? <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400">Ativa</Badge>
                      : <Badge variant="secondary">Revogada</Badge>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.last_used_at
                      ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(r.last_used_at).toLocaleString("pt-BR")}</span>
                      : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.is_active && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={revoking === r.id} onClick={() => revoke(r.id)}>
                        {revoking === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldOff className="mr-1 h-3.5 w-3.5" /> Revogar</>}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DOCS / ENDPOINTS (reuso para revendedor automático)                 */
/* ------------------------------------------------------------------ */
const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reseller-credits-api`;

function EndpointsRevendedor() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-card/40 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">URL Base da nossa API</div>
        <div className="mt-1 break-all font-mono text-sm text-primary">{API_BASE}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Todos os endpoints abaixo são servidos pela nossa infra. O provedor upstream é totalmente abstraído.
        </p>
      </Card>

      <DocBlock title="GET /status — Saúde da API" body={`curl -X GET "${API_BASE}/status" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# Resposta\n{\n  "success": true,\n  "data": {\n    "operacional": true,\n    "manutencao": false,\n    "mensagem": null,\n    "etaMinutos": null\n  }\n}`} />

      <DocBlock title="GET /saldo — Saldo do revendedor" body={`curl -X GET "${API_BASE}/saldo" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n{\n  "success": true,\n  "data": { "saldoCentavos": 2240, "saldoReais": "22.40" }\n}`} />

      <DocBlock title="GET /pacotes — Pacotes disponíveis" body={`curl -X GET "${API_BASE}/pacotes" \\\n  -H "X-API-Key: SUA_API_KEY"`} />

      <DocBlock title="GET /orcamento?creditos={qtd}" body={`curl -X GET "${API_BASE}/orcamento?creditos=100" \\\n  -H "X-API-Key: SUA_API_KEY"`} />

      <DocBlock title="POST /pedidos — Criar pedido" body={`curl -X POST "${API_BASE}/pedidos" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "creditos": 100,\n    "tipo_entrega": "workspace_proprio",\n    "workspace_id": "ws_xxx"\n  }'`} />

      <DocBlock title="GET /pedidos — Listar pedidos" body={`curl -X GET "${API_BASE}/pedidos?page=1&limit=20" \\\n  -H "X-API-Key: SUA_API_KEY"`} />

      <DocBlock title="GET /pedidos/{id} — Consultar pedido" body={`curl -X GET "${API_BASE}/pedidos/UUID" \\\n  -H "X-API-Key: SUA_API_KEY"`} />

      <DocBlock title="GET /transacoes — Histórico de saldo" body={`curl -X GET "${API_BASE}/transacoes?page=1&limit=30&tipo=entrada" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# tipo opcional: "entrada" (recargas) | "saida" (débitos)`} />

      <DocBlock title="GET /estatisticas?periodo=30d" body={`curl -X GET "${API_BASE}/estatisticas?periodo=30d" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# periodo: 7d | 30d | 90d | all\n# Retorna totais, ticket médio, pedidos por status, saldo atual`} />

      <DocBlock title="GET /uso — Uso da sua API key" body={`curl -X GET "${API_BASE}/uso" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# Retorna chamadas dos últimos 30 dias,\n# taxa de sucesso e contagem por endpoint`} />
    </div>
  );
}

function buildFullDocsRevendedor() {
  return `# API Recargas Automáticas — Documentação Completa

URL Base: ${API_BASE}
Header obrigatório: X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx
Formato de resposta: { "success": boolean, "data": {...} | "error": "..." }

## Comece em 3 passos
1. Autenticação — Inclua o header X-API-Key em todas as requisições.
2. Consulte o saldo — Antes de criar pedidos, verifique se há saldo suficiente.
3. Crie pedidos — Envie a quantidade de recargas e configure o tipo de entrega.

## Endpoints

### GET /status — Saúde da API
curl -X GET "${API_BASE}/status" -H "X-API-Key: SUA_API_KEY"

### GET /saldo — Saldo do revendedor
curl -X GET "${API_BASE}/saldo" -H "X-API-Key: SUA_API_KEY"

### GET /pacotes — Pacotes disponíveis
curl -X GET "${API_BASE}/pacotes" -H "X-API-Key: SUA_API_KEY"

### GET /orcamento?creditos={qtd}
curl -X GET "${API_BASE}/orcamento?creditos=100" -H "X-API-Key: SUA_API_KEY"

### POST /pedidos — Criar pedido
curl -X POST "${API_BASE}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "creditos": 100, "tipo_entrega": "workspace_proprio", "workspace_id": "ws_xxx" }'

### GET /pedidos — Listar pedidos
curl -X GET "${API_BASE}/pedidos?page=1&limit=20" -H "X-API-Key: SUA_API_KEY"

### GET /pedidos/{id} — Consultar pedido
curl -X GET "${API_BASE}/pedidos/UUID" -H "X-API-Key: SUA_API_KEY"

### GET /transacoes — Histórico de saldo
curl -X GET "${API_BASE}/transacoes?page=1&limit=30&tipo=entrada" -H "X-API-Key: SUA_API_KEY"
# tipo opcional: "entrada" (recargas) | "saida" (débitos)

### GET /estatisticas?periodo=30d
curl -X GET "${API_BASE}/estatisticas?periodo=30d" -H "X-API-Key: SUA_API_KEY"
# periodo: 7d | 30d | 90d | all

### GET /uso — Uso da sua API key
curl -X GET "${API_BASE}/uso" -H "X-API-Key: SUA_API_KEY"

## Limites e Regras
- Recargas: múltiplos dos pacotes ativos no seu nível.
- Preço: dinâmico, calculado pelo nível. Consulte /orcamento antes de criar pedido.
- Saldo insuficiente: HTTP 402, nada é debitado.
- Abstração total: nenhuma resposta expõe IDs/URLs/erros do provedor upstream.
- Nunca exponha a X-API-Key no frontend.`;
}

function buildFullDocsManual() {
  return `# API Recargas Manuais — Documentação Completa

URL Base: ${API_BASE}
Header obrigatório: X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx (chave com scope "recharges_manual")
SLA: até 24h úteis após o convite confirmado.

## Fluxo em 4 passos
1. Crie o pedido — POST /pedidos-manual (saldo debitado na hora).
2. Convide o bot — adicione recarga@lovconnect.store como Owner do workspace Lovable.
3. Confirme o convite — POST /pedidos-manual/{id}/convite com workspace_name e invite_status="sent".
4. Aguarde a entrega — equipe processa em até 24h. Acompanhe via GET /pedidos-manual/{id}.

## Endpoints

### GET /manual/info
curl -X GET "${API_BASE}/manual/info" -H "X-API-Key: SUA_API_KEY"

### POST /pedidos-manual — Criar pedido manual
curl -X POST "${API_BASE}/pedidos-manual" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "creditos": 100, "tipo_entrega": "workspace_proprio", "workspace_name": "Meu Workspace" }'

### POST /pedidos-manual/{id}/convite — Confirmar convite
curl -X POST "${API_BASE}/pedidos-manual/UUID/convite" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "workspace_name": "Meu Workspace", "invite_status": "sent" }'
# invite_status: "pending" | "sent" | "confirmed"

### GET /pedidos-manual — Listar pedidos manuais
curl -X GET "${API_BASE}/pedidos-manual?page=1&limit=20" -H "X-API-Key: SUA_API_KEY"

### GET /pedidos-manual/{id} — Consultar pedido manual
curl -X GET "${API_BASE}/pedidos-manual/UUID" -H "X-API-Key: SUA_API_KEY"

## Status do pedido
- manual_pendente — aguardando convite/processamento
- manual_processando — equipe trabalhando
- entregue — recargas no workspace
- cancelado — saldo estornado

## Observações
- Chave dedicada: a API automática NÃO funciona em /pedidos-manual.
- Em caso de falha, o saldo é estornado integralmente.`;
}

function CopyFullDocsButton({ getDocs, label = "Copiar documentação completa" }: { getDocs: () => string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(getDocs());
        toast.success("Documentação completa copiada");
      }}
    >
      <Copy className="mr-1.5 h-3.5 w-3.5" /> {label}
    </Button>
  );
}

function DocsRevendedor() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CopyFullDocsButton getDocs={buildFullDocsRevendedor} />
      </div>
      <Card className="border-border bg-card/60 p-6 backdrop-blur-sm">
        <h3 className="font-display text-base font-semibold">Comece em 3 passos</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { n: 1, t: "Autenticação", d: "Inclua o header X-API-Key em todas as requisições." },
            { n: 2, t: "Consulte o saldo", d: "Antes de criar pedidos, verifique se há saldo suficiente." },
            { n: 3, t: "Crie pedidos", d: "Envie a quantidade de recargas e configure o tipo de entrega." },
          ].map(s => (
            <div key={s.n} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{s.n}</div>
              <div className="mt-2 text-sm font-semibold">{s.t}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <DocBlock title="URL Base" body={`${API_BASE}\n\n# Header obrigatório\nX-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx\n\n# Todas as respostas seguem o padrão\n{ "success": boolean, "data": { ... } | "error": "..." }`} />
        <Card className="border-border bg-card/60 p-4 text-xs leading-relaxed">
          <h4 className="text-sm font-semibold">Limites e Regras</h4>
          <div className="mt-3 space-y-2">
            <div><strong>Recargas:</strong> múltiplos dos pacotes ativos no seu nível</div>
            <div className="border-t border-border pt-2">
              <strong>Preço:</strong> dinâmico, calculado pelo nível do revendedor.
              Consulte sempre <code className="font-mono">/orcamento</code> antes de criar um pedido.
            </div>
            <div className="border-t border-border pt-2">
              <strong>Saldo insuficiente:</strong> retorna HTTP 402 sem debitar.
            </div>
          </div>
        </Card>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-muted-foreground">
        <strong className="text-emerald-600 dark:text-emerald-400">Abstração total:</strong> nenhuma resposta
        expõe IDs, URLs ou erros do provedor upstream. Todos os identificadores são da nossa infra.
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
        <strong className="text-amber-600 dark:text-amber-400">Importante:</strong> nunca exponha
        a <code className="font-mono">X-API-Key</code> no frontend. Use-a apenas em servidores.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MANUAL — Endpoints & Docs                                           */
/* ------------------------------------------------------------------ */
function EndpointsManual() {
  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-card/40 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">URL Base — Fluxo Manual</div>
        <div className="mt-1 break-all font-mono text-sm text-amber-600 dark:text-amber-400">{API_BASE}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mesma URL e mesma <code className="font-mono">X-API-Key</code> do fluxo automático.
          O pedido manual é processado pela nossa equipe (SLA até 24h).
        </p>
      </Card>

      <DocBlock title="GET /manual/info — Info do fluxo manual" body={`curl -X GET "${API_BASE}/manual/info" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# Resposta\n{\n  "success": true,\n  "data": {\n    "emailBot": "recarga@lovconnect.store",\n    "slaHoras": 24,\n    "instrucoes": [ ... ]\n  }\n}`} />

      <DocBlock title="POST /pedidos-manual — Criar pedido manual" body={`curl -X POST "${API_BASE}/pedidos-manual" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "creditos": 100,\n    "tipo_entrega": "workspace_proprio",\n    "workspace_name": "Meu Workspace"\n  }'\n\n# Retorna pedidoId, status="manual_pendente",\n# emailBot a convidar e proximoPasso.`} />

      <DocBlock title="POST /pedidos-manual/{id}/convite — Confirmar convite" body={`curl -X POST "${API_BASE}/pedidos-manual/UUID/convite" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "workspace_name": "Meu Workspace",\n    "invite_status": "sent"\n  }'\n\n# invite_status: "pending" | "sent" | "confirmed"`} />

      <DocBlock title="GET /pedidos-manual — Listar pedidos manuais" body={`curl -X GET "${API_BASE}/pedidos-manual?page=1&limit=20" \\\n  -H "X-API-Key: SUA_API_KEY"`} />

      <DocBlock title="GET /pedidos-manual/{id} — Consultar pedido manual" body={`curl -X GET "${API_BASE}/pedidos-manual/UUID" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# Inclui workspace_name, invite_status e notas_equipe`} />
    </div>
  );
}

function DocsManual() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CopyFullDocsButton getDocs={buildFullDocsManual} />
      </div>
      <Card className="border-border bg-card/60 p-6 backdrop-blur-sm">
        <h3 className="font-display text-base font-semibold">Fluxo manual em 4 passos</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: 1, t: "Crie o pedido", d: "POST /pedidos-manual com recargas e tipo de entrega. Saldo é debitado na hora." },
            { n: 2, t: "Convide o bot", d: "Adicione recarga@lovconnect.store como Owner do workspace Lovable." },
            { n: 3, t: "Confirme o convite", d: "POST /pedidos-manual/{id}/convite com workspace_name e status=sent." },
            { n: 4, t: "Aguarde a entrega", d: "Equipe processa em até 24h. Acompanhe via GET /pedidos-manual/{id}." },
          ].map(s => (
            <div key={s.n} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400">{s.n}</div>
              <div className="mt-2 text-sm font-semibold">{s.t}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card/60 p-4 text-xs leading-relaxed">
          <h4 className="text-sm font-semibold">Quando usar o fluxo manual?</h4>
          <ul className="mt-3 list-disc space-y-1 pl-4">
            <li>Contas Lovable que não aceitam compra automática</li>
            <li>Workspaces novos que precisam de configuração assistida</li>
            <li>Quando o provedor automático está em manutenção</li>
          </ul>
        </Card>
        <Card className="border-border bg-card/60 p-4 text-xs leading-relaxed">
          <h4 className="text-sm font-semibold">Status do pedido</h4>
          <ul className="mt-3 list-disc space-y-1 pl-4">
            <li><code className="font-mono">manual_pendente</code> — aguardando convite/processamento</li>
            <li><code className="font-mono">manual_processando</code> — equipe trabalhando</li>
            <li><code className="font-mono">entregue</code> — recargas no workspace</li>
            <li><code className="font-mono">cancelado</code> — saldo estornado</li>
          </ul>
        </Card>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
        <strong className="text-amber-600 dark:text-amber-400">Chave dedicada:</strong> o fluxo manual exige
        uma <strong>API Key separada</strong> (gere a "API Manual" na sua página de API Recargas). A chave
        da API automática <strong>não</strong> funciona nos endpoints <code className="font-mono">/pedidos-manual</code>.
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
        <strong className="text-amber-600 dark:text-amber-400">SLA:</strong> entrega em até 24 horas úteis
        após o convite ser confirmado. Em caso de falha, o saldo é estornado integralmente.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SUB-TABS (Dashboard / Endpoints / Documentação)                      */
/* ------------------------------------------------------------------ */
function SubTabs({
  dashboard, endpoints, docs,
}: {
  dashboard: React.ReactNode; endpoints: React.ReactNode; docs: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="dashboard" className="mt-4">
      <TabsList className="bg-secondary/50">
        <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1.5 h-3.5 w-3.5" /> Dashboard</TabsTrigger>
        <TabsTrigger value="endpoints"><Plug className="mr-1.5 h-3.5 w-3.5" /> Endpoints</TabsTrigger>
        <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Documentação</TabsTrigger>
      </TabsList>
      <TabsContent value="dashboard" className="mt-4">{dashboard}</TabsContent>
      <TabsContent value="endpoints" className="mt-4">{endpoints}</TabsContent>
      <TabsContent value="docs" className="mt-4">{docs}</TabsContent>
    </Tabs>
  );
}

/* ================================================================== */
/* PÁGINA                                                              */
/* ================================================================== */
export default function GerenteApiRecargas() {
  return (
    <PageContainer>
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> API Recargas
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Gestão de APIs</h1>
        <p className="text-sm text-muted-foreground">
          Provedor, revendedores e fluxo manual — cada um com seu painel, endpoints e documentação.
        </p>
      </div>

      <Tabs defaultValue="provedor" className="space-y-2">
        <TabsList className="w-full justify-start bg-secondary/40">
          <TabsTrigger value="provedor" className="gap-2"><Server className="h-4 w-4" /> Provedor</TabsTrigger>
          <TabsTrigger value="revendedores" className="gap-2"><Users className="h-4 w-4" /> Revendedores</TabsTrigger>
          <TabsTrigger value="manual" className="gap-2"><Hand className="h-4 w-4" /> Manual</TabsTrigger>
        </TabsList>

        {/* PROVEDOR */}
        <TabsContent value="provedor">
          <SubTabs
            dashboard={<ProvedorConfig />}
            endpoints={
              <Placeholder
                icon={Plug}
                title="Endpoints do provedor"
                description="Em breve: explorador dos endpoints consumidos da API Lovable Credits (saldo, pedidos, ações)."
              />
            }
            docs={
              <Placeholder
                icon={BookOpen}
                title="Documentação do provedor"
                description="Em breve: referência completa das chamadas que fazemos ao Lovable Credits."
              />
            }
          />
        </TabsContent>

        {/* REVENDEDORES */}
        <TabsContent value="revendedores">
          <SubTabs
            dashboard={<RevendedoresKeys />}
            endpoints={<EndpointsRevendedor />}
            docs={<DocsRevendedor />}
          />
        </TabsContent>

        <TabsContent value="manual">
          <SubTabs
            dashboard={
              <div className="space-y-4">
                <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-card/40 p-4 text-xs text-muted-foreground">
                  <strong className="text-amber-600 dark:text-amber-400">Chaves exclusivas:</strong> o
                  fluxo manual usa chaves separadas (<code className="font-mono">scope = recharges_manual</code>).
                  Cada revendedor pode gerar a sua na página <em>API Recargas</em>.
                </Card>
                <RevendedoresKeys scope="recharges_manual" />
              </div>
            }
            endpoints={<EndpointsManual />}
            docs={<DocsManual />}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
