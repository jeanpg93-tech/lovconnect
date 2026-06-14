import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { DeployRechargePrompt } from "@/components/api/DeployRechargePrompt";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import CopyAllDocsButton from "@/components/api/CopyAllDocsButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  KeyRound, Copy, BookOpen, Shield, Zap, AlertTriangle, ArrowRight,
  Eye, EyeOff, RefreshCw, Terminal, GitBranch, Code2, CircleAlert,
  Loader2, CheckCircle2, Webhook, Send, History, Save,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const ALL_EVENTS = [
  "order.completed",
  "order.failed",
  "order.refunded",
  "manual.confirmed",
  "manual.delivered",
] as const;

function genSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "whsec_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-recharge-api`;

/* ---------- helpers ---------- */
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genKey() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `lov_live_${hex}`;
}

/* ---------- UI building blocks ---------- */
function CodeBlock({ title, body }: { title?: string; body: string }) {
  const onCopy = () => {
    navigator.clipboard.writeText(body);
    toast.success("Copiado");
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h4 className="text-sm font-semibold">{title}</h4>
          <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-xs">
            <Copy className="mr-1 h-3 w-3" /> Copiar
          </Button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre">
{body}
      </pre>
    </div>
  );
}

/* ---------- API KEY CARD ---------- */
function ApiKeyCard({
  scope = "recharges",
  title = "Sua API Key",
  subtitle = "Use esta chave para autenticar todas as suas requisições.",
  label = "API Recargas",
  accent = "primary",
}: {
  scope?: "recharges" | "recharges_manual";
  title?: string;
  subtitle?: string;
  label?: string;
  accent?: "primary" | "amber";
} = {}) {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [keyRow, setKeyRow] = useState<{ id: string; key_prefix: string; is_active: boolean } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const { data: ks } = await supabase
      .from("reseller_api_keys")
      .select("id, key_prefix, is_active")
      .eq("reseller_id", r.id)
      .eq("scope", scope)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    setKeyRow(ks?.[0] ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, scope]);

  const handleReset = async () => {
    if (!resellerId) return;
    setResetting(true);
    try {
      // revoga ativa(s)
      if (keyRow) {
        await supabase
          .from("reseller_api_keys")
          .update({ is_active: false, revoked_at: new Date().toISOString() })
          .eq("id", keyRow.id);
      }
      const key = genKey();
      const hash = await sha256Hex(key);
      const { error } = await supabase.from("reseller_api_keys").insert({
        reseller_id: resellerId,
        label,
        key_prefix: key.slice(0, 12),
        key_hash: hash,
        is_active: true,
        scope,
      });
      if (error) throw error;
      setNewKey(key);
      setConfirmOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar chave");
    } finally {
      setResetting(false);
    }
  };

  const masked = "•".repeat(56);
  const display = reveal && keyRow
    ? `${keyRow.key_prefix}${"•".repeat(48)}`
    : masked;

  return (
    <>
      <Card className={`relative overflow-hidden p-5 ${
        accent === "amber"
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
          : "border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
      }`}>
        <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${
          accent === "amber" ? "bg-amber-500/10" : "bg-primary/10"
        }`} />
        <div className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                accent === "amber" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/15 text-primary"
              }`}>
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-base font-bold">{title}</div>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {keyRow ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> API ativa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <CircleAlert className="h-3 w-3" /> Sem chave
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={resetting}
                className="h-8 w-full px-3 text-xs sm:h-7 sm:w-auto sm:px-2"
              >
                {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                {keyRow ? "Resetar chave" : "Gerar chave"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5">
            <code className="flex-1 truncate font-mono text-xs">
              {loading ? "Carregando…" : keyRow ? display : "Nenhuma chave ativa — clique em Gerar chave"}
            </code>
            {keyRow && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setReveal((v) => !v)} className="h-7 w-7 p-0">
                  {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </>
            )}
          </div>

          <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Shield className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            Mantenha sua API key em segredo. Nunca a compartilhe ou exponha em código público.
            A chave completa só é exibida uma vez na criação.
          </p>
        </div>
      </Card>

      {/* Confirm reset */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{keyRow ? "Resetar API Key?" : "Gerar API Key?"}</DialogTitle>
            <DialogDescription>
              {keyRow
                ? "A chave atual será revogada imediatamente e uma nova será gerada. Sistemas que usam a antiga vão parar de funcionar."
                : "Uma nova chave será gerada para você integrar as recargas no seu sistema."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleReset} disabled={resetting} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : keyRow ? "Resetar e gerar nova" : "Gerar chave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show new key */}
      <Dialog open={!!newKey} onOpenChange={(v) => !v && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sua nova API Key</DialogTitle>
            <DialogDescription className="text-amber-500">
              Copie agora — ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="break-all font-mono text-xs">{newKey}</div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (newKey) navigator.clipboard.writeText(newKey);
                toast.success("Copiada");
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Copy className="mr-1.5 h-4 w-4" /> Copiar chave
            </Button>
            <Button variant="ghost" onClick={() => setNewKey(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============ TABS ============ */

function TabInicio() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Comece em 3 passos
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { n: 1, t: "Autenticação", d: "Inclua o header X-API-Key em todas as requisições." },
            { n: 2, t: "Consulte o saldo", d: "Antes de criar pedidos, verifique se tem saldo suficiente." },
            { n: 3, t: "Crie pedidos", d: "Envie a quantidade de recargas e configure o tipo de entrega. O valor é debitado automaticamente." },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {s.n}
              </div>
              <div className="mt-2 text-sm font-semibold">{s.t}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CodeBlock
          title="URL Base"
          body={BASE_URL}
        />
        <CodeBlock
          title="Exemplo de requisição"
          body={`curl -X GET "${BASE_URL}/saldo" \\
  -H "X-API-Key: SUA_API_KEY"`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Limites e Regras
          </h4>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <div className="text-[11px] font-mono uppercase tracking-wider text-foreground">Recargas</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Mínimo: <strong className="text-foreground">10</strong> recargas</li>
              <li>Máximo: <strong className="text-foreground">5.000</strong> recargas</li>
              <li>Múltiplos de: <strong className="text-foreground">10</strong></li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" /> Preços (tabela progressiva)
          </h4>
          <table className="mt-3 w-full text-xs">
            <tbody className="divide-y divide-border">
              {[
                ["10 recargas", "R$ 0,70"],
                ["50 recargas", "R$ 3,50"],
                ["100 recargas", "R$ 5,90"],
                ["500 recargas", "R$ 23,90"],
                ["1000 recargas", "R$ 41,90"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 text-muted-foreground">{k}</td>
                  <td className="py-1.5 text-right font-mono font-semibold text-primary">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Use o endpoint <code className="font-mono bg-secondary/60 px-1 rounded">/orcamento</code> para calcular valores exatos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" /> Idempotência
          </h4>
          <p className="mt-2 text-xs text-muted-foreground">
            Em todo POST envie o header <code className="font-mono bg-secondary/60 px-1 rounded">Idempotency-Key</code>{" "}
            (até 128 chars). Retries com a mesma chave em até 24h retornam a resposta original
            e <strong>não debitam o saldo de novo</strong>. A resposta repetida vem com{" "}
            <code className="font-mono bg-secondary/60 px-1 rounded">Idempotent-Replay: true</code>.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-secondary/40 p-2.5 text-[11px] font-mono">{`Idempotency-Key: pedido-cliente-9384`}</pre>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Rate Limit
          </h4>
          <p className="mt-2 text-xs text-muted-foreground">
            Padrão: <strong className="text-foreground">60 req/min</strong> por chave (ajustável). Toda
            resposta inclui os headers abaixo. Quando excedido devolvemos <strong>HTTP 429</strong> com{" "}
            <code className="font-mono">Retry-After</code> em segundos.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-secondary/40 p-2.5 text-[11px] font-mono">{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1747591200`}</pre>
        </div>
      </div>
    </div>
  );
}

function TabEndpoints() {
  return (
    <div className="space-y-4">
      <CodeBlock
        title="GET /saldo — Consultar saldo"
        body={`curl -X GET "${BASE_URL}/saldo" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "saldoCentavos": 2240,
    "saldoReais": "22.40"
  }
}`}
      />
      <CodeBlock
        title="GET /orcamento?creditos={qtd} — Calcular orçamento"
        body={`curl -X GET "${BASE_URL}/orcamento?creditos=100" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "creditos": 100,
    "precoCentavos": 590,
    "precoReais": "5.90",
    "saldoAtualCentavos": 2240,
    "saldoAtualReais": "22.40",
    "saldoSuficiente": true,
    "precoUnitarioCentavos": 8.4
  }
}`}
      />
      <CodeBlock
        title="POST /pedidos — Criar pedido"
        body={`curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creditos": 100,
    "tipo_entrega": "workspace_proprio"
  }'

# tipo_entrega: "workspace_proprio" | "link" (omitido = cliente configura depois)
# Quando "link", envie também: "link_convite": "https://lovable.dev/invite/..."`}
      />
      <CodeBlock
        title="GET /pedidos — Listar pedidos (paginado)"
        body={`curl -X GET "${BASE_URL}/pedidos?page=1&limit=20" \\
  -H "X-API-Key: SUA_API_KEY"

# Query: page, limit (max 100), status (lista separada por vírgula)`}
      />
      <CodeBlock
        title="GET /pedidos/{id} — Consultar pedido"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID_DO_PEDIDO" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="PUT /pedidos/{id}/tipo-entrega — Definir tipo de entrega"
        body={`curl -X PUT "${BASE_URL}/pedidos/UUID/tipo-entrega" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tipo_entrega": "workspace_novo",
    "email_conta_lovable": "cliente@email.com"
  }'`}
      />
      <CodeBlock
        title="PUT /pedidos/{id}/email-lovable — Atualizar email Lovable"
        body={`curl -X PUT "${BASE_URL}/pedidos/UUID/email-lovable" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "email_conta_lovable": "novo@email.com" }'`}
      />
      <CodeBlock
        title="POST /pedidos/{id}/confirmar-convite — Confirmar convite do bot"
        body={`curl -X POST "${BASE_URL}/pedidos/UUID/confirmar-convite" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="GET /pedidos/{id}/acoes — Listar ações do bot"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID/acoes" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="GET /pedidos/{id}/acoes/{acaoId} — Consultar ação"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID/acoes/UUID_ACAO" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="POST /pedidos/{id}/cancelar — Cancelar pedido"
        body={`curl -X POST "${BASE_URL}/pedidos/UUID/cancelar" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="POST /pedidos/{id}/reembolso — Solicitar reembolso"
        body={`curl -X POST "${BASE_URL}/pedidos/UUID/reembolso" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
      <CodeBlock
        title="GET /webhooks — Configuração atual da chave"
        body={`curl -X GET "${BASE_URL}/webhooks" \\
  -H "X-API-Key: SUA_API_KEY"

# Retorna: webhookUrl, eventos, secret (mascarado), rateLimit`}
      />
      <CodeBlock
        title="GET /webhooks/entregas — Histórico de tentativas"
        body={`curl -X GET "${BASE_URL}/webhooks/entregas?limit=50" \\
  -H "X-API-Key: SUA_API_KEY"

# Query: limit (max 200), status=delivered|pending|failed`}
      />
      <CodeBlock
        title="POST /webhooks/test — Disparar evento de teste"
        body={`curl -X POST "${BASE_URL}/webhooks/test" \\
  -H "X-API-Key: SUA_API_KEY"`}
      />
    </div>
  );
}

function TabErros() {
  const erros: Array<[string, string, string]> = [
    ["401", "MISSING_API_KEY", "Header X-API-Key não fornecido"],
    ["401", "INVALID_API_KEY", "API key inválida ou inexistente"],
    ["403", "API_DISABLED", "API está desativada para este revendedor"],
    ["403", "ACCOUNT_DISABLED", "Conta de revendedor desativada"],
    ["429", "RATE_LIMITED", "Limite de requisições excedido"],
    ["400", "INSUFFICIENT_BALANCE", "Saldo insuficiente para esta operação"],
    ["400", "INVALID_CREDITS", "Quantidade de recargas inválida (10-5000, múltiplos de 10)"],
    ["400", "MISSING_FIELDS", "Campos obrigatórios faltando"],
    ["400", "MISSING_CREDITS", "Parâmetro creditos não fornecido"],
    ["400", "CREDITS_NOT_MULTIPLE_OF_10", "Recargas deve ser múltiplo de 10"],
    ["400", "INVALID_STATUS", "Status do pedido não permite a operação"],
    ["400", "INVALID_DELIVERY_TYPE", "Tipo de entrega inválido"],
    ["400", "DELIVERY_TYPE_LOCKED", "Tipo de entrega não pode ser alterado"],
    ["400", "CREDITS_ALREADY_SENT", "Recargas já foram enviados, operação bloqueada"],
    ["400", "ADMIN_PERMISSION_GRANTED", "Bot já tem permissão admin no workspace"],
    ["400", "MISSING_EMAIL", "Email não fornecido"],
    ["400", "INVALID_EMAIL", "Email em formato inválido"],
    ["404", "ORDER_NOT_FOUND", "Pedido não encontrado"],
    ["400", "ALREADY_REFUNDED", "Pedido já foi reembolsado anteriormente"],
  ];

  const status: Array<[string, string, string]> = [
    ["aguardando", "neutral", "Pedido criado, aguardando configuração do workspace"],
    ["configurando", "info", "Cliente configurando tipo de entrega e workspace"],
    ["recarregando", "info", "Bot fazendo farm de recargas no workspace"],
    ["entregando", "info", "Bot entregando/transferindo o workspace para o cliente"],
    ["sucesso", "success", "Recargas adicionados com sucesso"],
    ["falha", "danger", "Erro no processamento"],
    ["queimado", "danger", "Problema no workspace"],
    ["cancelado", "neutral", "Pedido cancelado (pode solicitar reembolso proporcional)"],
    ["reembolsado", "neutral", "Valor devolvido ao saldo"],
  ];
  const colorMap: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    danger: "bg-destructive/15 text-destructive",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold mb-3">Formato de Erro</h3>
        <p className="text-xs text-muted-foreground mb-3">Todas as respostas de erro seguem o mesmo formato:</p>
        <CodeBlock
          body={`{
  "success": false,
  "error": "Mensagem descritiva do erro",
  "code": "CODIGO_DO_ERRO"
}`}
        />
      </div>

      <div>
        <h3 className="font-display text-base font-semibold mb-3">Códigos de Erro</h3>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 w-16">HTTP</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {erros.map(([http, code, desc]) => (
                <tr key={code} className="hover:bg-secondary/30">
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold ${
                      http.startsWith("4") ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                      http.startsWith("5") ? "bg-destructive/15 text-destructive" :
                      "bg-secondary text-foreground"
                    }`}>{http}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-primary">{code}</td>
                  <td className="px-4 py-2 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <h3 className="font-display text-base font-semibold mb-3">Status de Pedido</h3>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {status.map(([s, c, d]) => (
                <tr key={s}>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-mono font-bold ${colorMap[c]}`}>
                      {s}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* ---------- WEBHOOK CONFIG CARD ---------- */
function WebhookConfigCard({
  scope,
  title,
  accent,
}: {
  scope: "recharges" | "recharges_manual";
  title: string;
  accent: "primary" | "amber";
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keyRow, setKeyRow] = useState<any>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...ALL_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState(false);
  const [deliveries, setDeliveries] = useState<any[]>([]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    const { data: ks } = await supabase
      .from("reseller_api_keys")
      .select("id, reseller_id, webhook_url, webhook_secret, webhook_events, rate_limit_per_minute")
      .eq("reseller_id", r.id).eq("scope", scope).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1);
    const k = ks?.[0];
    setKeyRow(k ?? null);
    setUrl(k?.webhook_url ?? "");
    setEvents((k?.webhook_events as string[] | null) ?? [...ALL_EVENTS]);
    setSecret(k?.webhook_secret ?? null);
    if (k) {
      const { data: del } = await supabase
        .from("reseller_api_webhook_deliveries")
        .select("id, event, response_status, delivered_at, attempt, created_at, target_url")
        .eq("api_key_id", k.id).order("created_at", { ascending: false }).limit(8);
      setDeliveries(del ?? []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user, scope]);

  const save = async () => {
    if (!keyRow) { toast.error("Crie uma API Key primeiro"); return; }
    setSaving(true);
    try {
      const cleanUrl = url.trim();
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) throw new Error("URL deve começar com https://");
      let s = secret;
      if (cleanUrl && !s) s = genSecret();
      const { error } = await supabase
        .from("reseller_api_keys")
        .update({
          webhook_url: cleanUrl || null,
          webhook_events: events,
          webhook_secret: s,
        })
        .eq("id", keyRow.id);
      if (error) throw error;
      toast.success("Webhook salvo");
      setSecret(s);
      load();
    } catch (e: any) { toast.error(e.message ?? "Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const regenSecret = async () => {
    if (!keyRow) return;
    const s = genSecret();
    const { error } = await supabase.from("reseller_api_keys").update({ webhook_secret: s }).eq("id", keyRow.id);
    if (error) { toast.error(error.message); return; }
    setSecret(s); setRevealSecret(true);
    toast.success("Novo secret gerado");
  };

  const sendTest = async () => {
    if (!keyRow?.webhook_url) { toast.error("Configure a URL antes"); return; }
    setTesting(true);
    try {
      const { error } = await supabase.from("reseller_api_webhook_deliveries").insert({
        reseller_id: keyRow.reseller_id ?? (await supabase.from("reseller_api_keys").select("reseller_id").eq("id", keyRow.id).maybeSingle()).data?.reseller_id,
        api_key_id: keyRow.id,
        event: "webhook.test",
        payload: { event: "webhook.test", message: "Disparo manual do painel", timestamp: new Date().toISOString() },
        target_url: keyRow.webhook_url,
      });
      if (error) throw error;
      toast.success("Teste enfileirado — entrega em até 1 min");
      setTimeout(load, 4000);
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
    finally { setTesting(false); }
  };

  const toggleEvent = (e: string) => {
    setEvents((cur) => cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]);
  };

  return (
    <Card className={`p-5 ${accent === "amber" ? "border-amber-500/30" : "border-primary/30"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Webhook className={`h-4 w-4 ${accent === "amber" ? "text-amber-500" : "text-primary"}`} />
        <h4 className="font-display text-sm font-bold">{title}</h4>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Receba notificações HTTP POST quando o status do pedido mudar. Cada entrega vem assinada com
        HMAC-SHA256 no header <code className="font-mono">X-Webhook-Signature</code>.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Carregando…</div>
      ) : !keyRow ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          Crie uma API Key (acima) para configurar o webhook.
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">URL do webhook</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://meusistema.com/webhooks/lovmain"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">Eventos</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ALL_EVENTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEvent(e)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-mono transition ${
                    events.includes(e)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Secret (HMAC-SHA256)</Label>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
              <code className="flex-1 truncate font-mono text-[11px]">
                {secret ? (revealSecret ? secret : "whsec_" + "•".repeat(40)) : "— será gerado ao salvar —"}
              </code>
              {secret && (
                <>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setRevealSecret((v) => !v)}>
                    {revealSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copiado"); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={regenSecret}>
                <RefreshCw className="mr-1 h-3 w-3" /> Regerar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Salvar
            </Button>
            <Button onClick={sendTest} disabled={testing || !keyRow.webhook_url} size="sm" variant="outline">
              {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Enviar evento de teste
            </Button>
          </div>

          {deliveries.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-2">
                <History className="h-3 w-3" /> Últimas entregas
              </div>
              <div className="space-y-1.5">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2 py-1.5 text-[11px]">
                    <span className="font-mono">{d.event}</span>
                    <span className="flex-1 text-muted-foreground">{new Date(d.created_at).toLocaleString("pt-BR")}</span>
                    <Badge variant={d.delivered_at ? "default" : "outline"} className={`text-[10px] ${d.delivered_at ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "border-amber-500/30 text-amber-600 dark:text-amber-400"}`}>
                      {d.delivered_at ? `OK ${d.response_status ?? ""}` : `tentativa ${d.attempt}`}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TabWebhooks() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <WebhookConfigCard scope="recharges" title="Webhook — API Automática" accent="primary" />
        <WebhookConfigCard scope="recharges_manual" title="Webhook — API Manual" accent="amber" />
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-5">
        <h4 className="font-display text-sm font-bold mb-2">Como verificar a assinatura</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Calcule HMAC-SHA256 do body cru (string JSON exata recebida) usando o seu secret e compare em
          tempo constante com o header <code className="font-mono">X-Webhook-Signature</code>.
        </p>
        <CodeBlock
          title="Node.js — verificar assinatura"
          body={`import crypto from "node:crypto";

app.post("/webhooks/lovmain", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.header("X-Webhook-Signature") ?? "";
  const expected = crypto.createHmac("sha256", process.env.WHSEC).update(req.body).digest("hex");
  const ok = sig.length === expected.length &&
             crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).send("invalid signature");

  const evt = JSON.parse(req.body.toString("utf8"));
  console.log(evt.event, evt.pedidoId, evt.status);
  res.status(200).send("ok");
});`}
        />
        <CodeBlock
          title="Python — verificar assinatura"
          body={`import hmac, hashlib
from flask import request, abort

@app.post("/webhooks/lovmain")
def hook():
    raw = request.get_data()
    sig = request.headers.get("X-Webhook-Signature", "")
    exp = hmac.new(WHSEC.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, exp):
        abort(401)
    evt = request.get_json(force=True)
    return "ok"`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-5">
        <h4 className="font-display text-sm font-bold mb-3">Eventos disponíveis</h4>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border">
            {[
              ["order.completed", "Pedido (automático ou manual) entrou em status sucesso"],
              ["order.failed", "Pedido entrou em falha ou erro"],
              ["order.refunded", "Pedido cancelado/estornado com reembolso no saldo"],
              ["manual.confirmed", "Pagamento manual confirmado pela equipe"],
              ["manual.delivered", "Pedido manual marcado como entregue"],
            ].map(([e, d]) => (
              <tr key={e}>
                <td className="py-2 pr-3 font-mono text-primary">{e}</td>
                <td className="py-2 text-muted-foreground">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CodeBlock
        title="Payload exemplo — order.completed"
        body={`POST {sua_url}
Content-Type: application/json
X-Webhook-Event: order.completed
X-Webhook-Delivery: 9b1f...
X-Webhook-Attempt: 1
X-Webhook-Signature: 4f6c...   (hex HMAC-SHA256 do body)

{
  "event": "order.completed",
  "pedidoId": "de573e5d-ae1c-...",
  "status": "sucesso",
  "creditos": 100,
  "precoCentavos": 590,
  "tipoEntrega": "workspace_proprio",
  "timestamp": "2026-05-18T16:42:11Z"
}`}
      />

      <div className="rounded-xl border border-border bg-card/60 p-5">
        <h4 className="font-display text-sm font-bold mb-2">Política de retry</h4>
        <p className="text-xs text-muted-foreground">
          Até <strong>6 tentativas</strong> com backoff exponencial: 1m, 5m, 15m, 1h, 6h.
          Resposta HTTP 2xx em até 10s = entrega concluída. Qualquer outra resposta agenda nova tentativa.
        </p>
      </div>
    </div>
  );
}

function StepCard({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border border-border bg-card/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-display text-sm font-bold">
          {n}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <div className="font-display text-base font-bold">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function TabFluxoProprio() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed">
        <strong className="text-primary">Workspace Próprio</strong> — o cliente convida nosso bot para
        o workspace dele no Lovable. O fluxo tem duas fases: primeiro o bot identifica o workspace
        (convite com qualquer permissão), depois o cliente promove o bot para Owner. Após isso,
        o farm de recargas inicia automaticamente.
      </div>

      <StepCard n={1} title="Criar o pedido" subtitle="Debita o saldo e reserva os recargas">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">POST /pedidos</div>
        <CodeBlock
          title="O que enviar"
          body={`X-API-Key: SUA_API_KEY

{
  "creditos": 100   // Quantidade (10-5000, múltiplo de 10)
}`}
        />
        <CodeBlock
          title="O que retorna"
          body={`{
  "success": true,
  "data": {
    "pedidoId": "de573e5d-ae1c-...",
    "creditos": 100,
    "valorCentavos": 590,
    "valorReais": "5.90",
    "status": "aguardando",
    "linkCliente": "https://pedido.lvbcredits.com/...",
    "novoSaldoCentavos": 46516,
    "novoSaldoReais": "465.16"
  }
}`}
        />
        <p className="text-[11px] text-muted-foreground">
          O valor é debitado automaticamente do seu saldo. <strong>Guarde o pedidoId</strong> — você vai precisar dele em todos os próximos passos.
        </p>
      </StepCard>

      <StepCard n={2} title="Definir tipo de entrega" subtitle="Configura o pedido como workspace próprio">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">PUT /pedidos/{"{pedidoId}"}/tipo-entrega</div>
        <CodeBlock
          title="O que enviar"
          body={`{
  "tipo_entrega": "workspace_proprio"
}`}
        />
        <CodeBlock
          title="O que retorna"
          body={`{
  "success": true,
  "data": {
    "id": "de573e5d-ae1c-...",
    "status": "configurando",
    "tipoEntrega": "workspace_proprio",
    "emailConviteBot": "bot123@kodaway.com",
    ...
  }
}`}
        />
        <p className="text-[11px] text-muted-foreground">
          Anote o <code className="font-mono bg-secondary/60 px-1 rounded">emailConviteBot</code>.
          O cliente vai precisar convidar esse email no workspace dele no Lovable.
        </p>
      </StepCard>

      <StepCard n={3} title="Fase 1 — Identificar o workspace" subtitle="Cliente convida o bot com qualquer permissão">
        <ol className="ml-4 list-decimal space-y-2 text-xs text-muted-foreground">
          <li>O cliente acessa o workspace dele no Lovable, vai em <strong>Configurações</strong> e convida o email do bot (<code className="font-mono">emailConviteBot</code>) com qualquer permissão (viewer, editor, admin).</li>
          <li>Depois que o cliente convidou, chame o endpoint <code className="font-mono">confirmar-convite</code>:</li>
        </ol>
        <CodeBlock
          title="POST /pedidos/{pedidoId}/confirmar-convite"
          body={`X-API-Key: SUA_API_KEY
# Sem body`}
        />
        <CodeBlock
          title="GET /pedidos/{pedidoId}/acoes/{acaoId} — resultado"
          body={`{
  "success": true,
  "data": {
    "id": "9da2e480-eb33-...",
    "tipo": "confirmar_convite",
    "status": "finalizada",
    "resultado": {
      "motivo": "permissao_incorreta",
      "workspace_id": "HsoNyzb6MImX1oi2ZZzF",
      "workspace_nome": "Meu Workspace"
    }
  }
}`}
        />
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <strong className="font-mono text-amber-600 dark:text-amber-400">"permissao_incorreta"</strong>{" "}
            <span className="text-[10px] uppercase text-muted-foreground">esperado</span>
            <p className="mt-1 text-muted-foreground">
              Bot encontrou o workspace e precisa de permissão Owner. Siga para o passo 4.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <strong className="font-mono text-emerald-600 dark:text-emerald-400">"confirmado"</strong>
            <p className="mt-1 text-muted-foreground">
              Cliente já convidou direto como Owner. Pule para o passo 5.
            </p>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <strong className="font-mono text-destructive">"nao_encontrado"</strong>
            <p className="mt-1 text-muted-foreground">
              Bot não encontrou nenhum convite. Cliente deve verificar o email e enviar novamente, depois repita este passo.
            </p>
          </div>
        </div>
      </StepCard>

      <StepCard n={4} title="Fase 2 — Promover o bot a Owner" subtitle="Cliente eleva permissões para liberar o farm">
        <ol className="ml-4 list-decimal space-y-1.5 text-xs text-muted-foreground">
          <li>Atualize a página do workspace no Lovable.</li>
          <li>Localize o bot na lista de membros.</li>
          <li>Em <strong>Role</strong>, selecione <strong>Owner</strong>.</li>
          <li>Chame <code className="font-mono">confirmar-convite</code> novamente:</li>
        </ol>
        <CodeBlock
          title="POST /pedidos/{pedidoId}/confirmar-convite"
          body={`X-API-Key: SUA_API_KEY`}
        />
        <CodeBlock
          title="GET /pedidos/{pedidoId}/acoes/{acaoId} — resultado"
          body={`{
  "success": true,
  "data": {
    "id": "b2f15c3a-7d91-...",
    "status": "finalizada",
    "resultado": {
      "motivo": "confirmado",
      "workspace_id": "HsoNyzb6MImX1oi2ZZzF",
      "workspace_nome": "Meu Workspace"
    }
  }
}`}
        />
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <strong className="font-mono text-emerald-600 dark:text-emerald-400">"confirmado"</strong>
            <p className="mt-1 text-muted-foreground">
              Bot entrou como Owner. O farm de recargas vai começar automaticamente. Siga para o passo 5.
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <strong className="font-mono text-amber-600 dark:text-amber-400">"permissao_incorreta"</strong>
            <p className="mt-1 text-muted-foreground">
              Cliente precisa alterar a Role do bot para Owner e então repita este passo.
            </p>
          </div>
        </div>
      </StepCard>

      <StepCard n={5} title="Acompanhar até a conclusão" subtitle='Consulte o pedido até o status mudar para "sucesso"'>
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">GET /pedidos/{"{pedidoId}"}</div>
        <CodeBlock
          title="Quando concluído"
          body={`{
  "success": true,
  "data": {
    "id": "de573e5d-ae1c-...",
    "creditos": 100,
    "status": "sucesso",
    "tipoEntrega": "workspace_proprio",
    "workspaceId": "HsoNyzb6MImX1oi2ZZzF",
    "workspaceName": "Meu Workspace",
    "creditosEnviados": 100,
    "creditsGranted": 20,
    "creditsGrantedEnd": 120,
    "etapaProcessamento": 4
  }
}`}
        />
        <p className="text-[11px] text-muted-foreground">
          Recomendamos consultar o pedido a cada 30 segundos. O <code className="font-mono">linkCliente</code> também
          pode ser compartilhado para o cliente acompanhar em tempo real.
        </p>
      </StepCard>

      <Card className="bg-secondary/30 p-5">
        <h4 className="font-display text-sm font-bold mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" /> Resumo do fluxo
        </h4>
        <ol className="space-y-1.5 text-xs">
          {[
            ["POST", "/pedidos", "Cria o pedido e debita o saldo"],
            ["PUT", "/pedidos/{id}/tipo-entrega", "Define workspace_proprio"],
            ["—", "Cliente convida emailConviteBot (qualquer permissão)", ""],
            ["POST", "/pedidos/{id}/confirmar-convite", "Fase 1: Bot identifica o workspace"],
            ["GET", "/pedidos/{id}/acoes/{acaoId}", "Resultado (motivo: permissao_incorreta)"],
            ["—", "Cliente promove o bot para Owner", ""],
            ["POST", "/pedidos/{id}/confirmar-convite", "Fase 2: Bot confirma Owner"],
            ["GET", "/pedidos/{id}/acoes/{acaoId}", "Resultado (motivo: confirmado)"],
            ["GET", "/pedidos/{id}", 'Acompanha até "sucesso"'],
          ].map(([m, p, d], i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={`inline-block w-12 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10px] font-bold ${
                m === "POST" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                m === "GET" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                m === "PUT" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                "bg-muted text-muted-foreground"
              }`}>{m}</span>
              <code className="font-mono text-xs">{p}</code>
              {d && <span className="text-muted-foreground text-xs">— {d}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function TabExemplos() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Fluxo Completo: Workspace Novo</h3>
        <p className="text-xs text-muted-foreground">
          Crie um pedido e entregue recargas em uma conta Lovable nova do cliente.
        </p>

        <CodeBlock
          title="1. Verificar saldo"
          body={`curl -X GET "${BASE_URL}/saldo" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{ "success": true, "data": { "saldoCentavos": 2240, "saldoReais": "22.40" } }`}
        />
        <CodeBlock
          title="2. Criar pedido"
          body={`curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "creditos": 100 }'`}
        />
        <CodeBlock
          title="3. Definir tipo de entrega"
          body={`curl -X PUT "${BASE_URL}/pedidos/{id}/tipo-entrega" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tipo_entrega": "workspace_novo",
    "email_conta_lovable": "cliente@email.com"
  }'`}
        />
        <CodeBlock
          title="4. Acompanhar status"
          body={`curl -X GET "${BASE_URL}/pedidos/{id}" \\
  -H "X-API-Key: SUA_API_KEY"`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Fluxo Completo: Workspace Próprio</h3>
        <p className="text-xs text-muted-foreground">O cliente convida o bot no workspace existente dele.</p>

        <CodeBlock
          title="1. Criar pedido e definir tipo"
          body={`curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "creditos": 100 }'

# Depois definir tipo de entrega:
curl -X PUT "${BASE_URL}/pedidos/{id}/tipo-entrega" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tipo_entrega": "workspace_proprio",
    "email_conta_lovable": "cliente@email.com"
  }'`}
        />
        <CodeBlock
          title="2. Consultar email do bot"
          body={`curl -X GET "${BASE_URL}/pedidos/{id}" \\
  -H "X-API-Key: SUA_API_KEY"

# Use o campo "emailConviteBot" para o cliente convidar o bot`}
        />
        <CodeBlock
          title="3. Confirmar convite"
          body={`curl -X POST "${BASE_URL}/pedidos/{id}/confirmar-convite" \\
  -H "X-API-Key: SUA_API_KEY"`}
        />
        <CodeBlock
          title="4. Acompanhar ações"
          body={`curl -X GET "${BASE_URL}/pedidos/{id}/acoes" \\
  -H "X-API-Key: SUA_API_KEY"

# Se statusVerificacaoConvite = "nao_encontrado", repetir passos 3-4
# Se "permissao_incorreta", cliente promove o bot a Owner`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Fluxo Completo: Link de Convite</h3>
        <p className="text-xs text-muted-foreground">
          Forneça o link de convite do workspace já na criação. O pedido vai direto para "configurando".
        </p>
        <CodeBlock
          title="1. Criar pedido com link de convite"
          body={`curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creditos": 100,
    "tipo_entrega": "link",
    "link_convite": "https://lovable.dev/invite/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }'`}
        />
        <CodeBlock
          title="2. Acompanhar status"
          body={`curl -X GET "${BASE_URL}/pedidos/{id}" \\
  -H "X-API-Key: SUA_API_KEY"`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" /> JavaScript / Node.js
        </h3>
        <CodeBlock
          body={`const API_KEY = "SUA_API_KEY";
const BASE_URL = "${BASE_URL}";

async function criarPedido(creditos) {
  const r = await fetch(\`\${BASE_URL}/pedidos\`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ creditos }),
  });
  const data = await r.json();
  if (!data.success) throw new Error(\`[\${data.code}] \${data.error}\`);
  return data.data;
}

async function definirTipoEntrega(pedidoId, tipo, email) {
  const r = await fetch(\`\${BASE_URL}/pedidos/\${pedidoId}/tipo-entrega\`, {
    method: "PUT",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo_entrega: tipo, email_conta_lovable: email }),
  });
  const data = await r.json();
  if (!data.success) throw new Error(\`[\${data.code}] \${data.error}\`);
  return data.data;
}

async function consultarPedido(pedidoId) {
  const r = await fetch(\`\${BASE_URL}/pedidos/\${pedidoId}\`, {
    headers: { "X-API-Key": API_KEY },
  });
  return (await r.json()).data;
}

const pedido = await criarPedido(100);
await definirTipoEntrega(pedido.pedidoId, "workspace_novo", "cliente@email.com");
const status = await consultarPedido(pedido.pedidoId);
console.log("Status:", status.status);`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" /> Python
        </h3>
        <CodeBlock
          body={`import requests, time

API_KEY = "SUA_API_KEY"
BASE_URL = "${BASE_URL}"
headers = {"X-API-Key": API_KEY}

def criar_pedido(creditos):
    r = requests.post(f"{BASE_URL}/pedidos",
        headers={**headers, "Content-Type": "application/json"},
        json={"creditos": creditos})
    data = r.json()
    if not data["success"]:
        raise Exception(f"[{data['code']}] {data['error']}")
    return data["data"]

def definir_tipo_entrega(pedido_id, tipo, email):
    r = requests.put(f"{BASE_URL}/pedidos/{pedido_id}/tipo-entrega",
        headers={**headers, "Content-Type": "application/json"},
        json={"tipo_entrega": tipo, "email_conta_lovable": email})
    data = r.json()
    if not data["success"]:
        raise Exception(f"[{data['code']}] {data['error']}")
    return data["data"]

def consultar_pedido(pedido_id):
    return requests.get(f"{BASE_URL}/pedidos/{pedido_id}",
        headers=headers).json()["data"]

pedido = criar_pedido(100)
definir_tipo_entrega(pedido["pedidoId"], "workspace_novo", "cliente@email.com")
time.sleep(10)
print("Status:", consultar_pedido(pedido["pedidoId"])["status"])`}
        />
      </section>
    </div>
  );
}

/* ============ PAGE ============ */
export default function RevendedorApiRecargas() {
  const docsRef = useRef<HTMLDivElement>(null);
  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-3xl font-black tracking-tighter sm:text-5xl">
            API <span className="text-primary italic">Gerar Recargas</span>
          </h1>
        }
        description="Integre seu sistema para criar pedidos de recargas de recargas Lovable automaticamente."
        icon={KeyRound}
        actions={<CopyAllDocsButton containerRef={docsRef} fileName="api-recargas-revendedor.md" />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ApiKeyCard
          scope="recharges"
          title="API Automática"
          subtitle="Pedidos automáticos entregues em minutos pelo provedor."
          label="API Recargas — Automática"
          accent="primary"
        />
        <ApiKeyCard
          scope="recharges_manual"
          title="API Manual"
          subtitle="Pedidos manuais entregues pela equipe em até 24h."
          label="API Recargas — Manual"
          accent="amber"
        />
      </div>

      <Tabs defaultValue="inicio" className="space-y-6">
        <TabsList className="bg-secondary/40 border border-border h-auto p-1 flex-wrap">
          <TabsTrigger value="inicio" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Início Rápido
          </TabsTrigger>
          <TabsTrigger value="endpoints" className="gap-1.5">
            <Terminal className="h-3.5 w-3.5" /> Endpoints
          </TabsTrigger>
          <TabsTrigger value="erros" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Erros
          </TabsTrigger>
          <TabsTrigger value="fluxo" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Fluxo Workspace Próprio
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1.5">
            <Webhook className="h-3.5 w-3.5" /> Webhooks
          </TabsTrigger>
          <TabsTrigger value="exemplos" className="gap-1.5">
            <Code2 className="h-3.5 w-3.5" /> Exemplos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inicio"><TabInicio /></TabsContent>
        <TabsContent value="endpoints"><TabEndpoints /></TabsContent>
        <TabsContent value="erros"><TabErros /></TabsContent>
        <TabsContent value="fluxo"><TabFluxoProprio /></TabsContent>
        <TabsContent value="webhooks"><TabWebhooks /></TabsContent>
        <TabsContent value="exemplos"><TabExemplos /></TabsContent>
      </Tabs>

      {/* Hidden mirror used by "Copiar documentação completa" para coletar
          o conteúdo de todas as abas de uma vez. */}
      <div
        ref={docsRef}
        aria-hidden="true"
        className="sr-only"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
      >
        <h2>Início Rápido</h2><TabInicio />
        <h2>Endpoints</h2><TabEndpoints />
        <h2>Erros</h2><TabErros />
        <h2>Fluxo Workspace Próprio</h2><TabFluxoProprio />
        <h2>Webhooks</h2><TabWebhooks />
        <h2>Exemplos</h2><TabExemplos />
      </div>

      <NavLink
        to="/painel/revendedor/api"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        Gerenciar todas as minhas chaves <ArrowRight className="h-3 w-3" />
      </NavLink>
    </PageContainer>
  );
}
