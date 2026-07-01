import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, KeyRound, Copy, Check, AlertTriangle, Plus, Trash2,
  BookOpen, Webhook as WebhookIcon, Code2, Download, FileText,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "";

type ApiKey = {
  id: string;
  key_prefix: string;
  label: string | null;
  webhook_url: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

function makeRandomKey() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "sk_claude_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function RevendedorApiClaude() {
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const { data: k } = await supabase
      .from("reseller_claude_api_keys")
      .select("id, key_prefix, label, webhook_url, webhook_secret, is_active, last_used_at, created_at, revoked_at")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false });
    setKeys((k ?? []) as any);
    const first = (k ?? [])[0] as any;
    if (first) {
      setWebhookUrl(first.webhook_url ?? "");
      setWebhookSecret(first.webhook_secret ?? "");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!resellerId) return;
    setCreating(true);
    try {
      const raw = makeRandomKey();
      const hash = await sha256(raw);
      const prefix = raw.slice(0, 16);
      const { error } = await supabase.from("reseller_claude_api_keys").insert({
        reseller_id: resellerId,
        key_hash: hash,
        key_prefix: prefix,
        label: newLabel || null,
      });
      if (error) throw error;
      setRevealed(raw);
      setNewLabel("");
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar chave");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revogar essa chave? Ela parará de funcionar imediatamente.")) return;
    const { error } = await supabase
      .from("reseller_claude_api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chave revogada");
    load();
  };

  const saveWebhook = async () => {
    if (!resellerId || keys.length === 0) return toast.error("Crie uma chave primeiro.");
    setSavingWebhook(true);
    const { error } = await supabase
      .from("reseller_claude_api_keys")
      .update({ webhook_url: webhookUrl || null, webhook_secret: webhookSecret || null })
      .eq("reseller_id", resellerId);
    setSavingWebhook(false);
    if (error) return toast.error(error.message);
    toast.success("Webhook salvo");
  };

  const sendTestWebhook = async () => {
    if (!webhookUrl) return toast.error("Salve uma URL de webhook primeiro.");
    setTestingWebhook(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("claude-webhook-test", { body: {} });
      if (error) throw error;
      if ((data as any)?.success) {
        setTestResult({ ok: true, msg: `Entregue — HTTP ${(data as any).status ?? 200}` });
        toast.success("Webhook entregue com sucesso");
      } else {
        const d = (data as any) ?? {};
        setTestResult({ ok: false, msg: d.error || d.reason || `Falha (HTTP ${d.status ?? "?"})` });
        toast.error("Falha ao entregar webhook");
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message ?? String(e) });
      toast.error(e?.message ?? "Erro ao testar webhook");
    } finally {
      setTestingWebhook(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const buildFullDocsMarkdown = () => {
    const base = `${FUNCTIONS_BASE}/reseller-claude-api`;
    return `# API Claude — Documentação para Revendedores

Integre a venda de chaves Claude no seu site, loja ou aplicativo próprio.
Cada chamada é autenticada por uma API Key exclusiva do seu painel e as
cobranças são feitas automaticamente na sua **carteira**.

---

## Sumário

1. Base URL & Autenticação
2. Formato de resposta e códigos de erro
3. Endpoints
   - GET  /status
   - GET  /planos
   - GET  /saldo
   - POST /chaves     — emitir chave (venda)
   - GET  /chaves     — listar pedidos
   - GET  /chaves/{id} — detalhe do pedido
4. Idempotência
5. Webhook (notificação assíncrona)
6. Exemplos por linguagem (cURL, Node.js, PHP, Python)
7. Boas práticas

---

## 1. Base URL & Autenticação

**Base URL:**
\`\`\`
${base}
\`\`\`

Envie sua chave de API no header \`X-API-Key\` em **toda** requisição:

\`\`\`
X-API-Key: sk_claude_xxxxxxxxxxxxxxxx...
Content-Type: application/json
\`\`\`

> A chave é exibida **uma única vez** quando você a gera no painel.
> Trate como senha — nunca comite no repositório nem exponha no front-end.
> Se vazar, revogue imediatamente e gere outra.

---

## 2. Formato de resposta

Todas as respostas são JSON e sempre trazem o campo booleano \`success\`.

**Sucesso**
\`\`\`json
{ "success": true, "...": "..." }
\`\`\`

**Erro**
\`\`\`json
{ "success": false, "error": "codigo_do_erro" }
\`\`\`

### Códigos HTTP mais comuns

| HTTP | Quando acontece |
|------|-----------------|
| 200  | Requisição concluída |
| 400  | \`invalid_plano\`, \`plano_indisponivel\` — payload inválido |
| 401  | \`Missing X-API-Key\` ou chave inválida/revogada |
| 402  | \`saldo_insuficiente\` — carteira não cobre o custo |
| 403  | Revendedor inativo, ativação pendente ou Claude desabilitado |
| 404  | Pedido não encontrado |
| 500  | \`provider_not_configured\` — contate o suporte |
| 502  | \`provider_error\` / \`provider_network_error\` — falha no fornecedor |

---

## 3. Endpoints

### GET /status

Verifica se sua chave está ativa e se o Claude está habilitado.

\`\`\`bash
curl ${base}/status -H "X-API-Key: $YOUR_KEY"
\`\`\`

\`\`\`json
{ "success": true, "claude_enabled": true }
\`\`\`

---

### GET /planos

Retorna o catálogo com o **seu preço final** (já aplicando o markup do seu painel).

\`\`\`bash
curl ${base}/planos -H "X-API-Key: $YOUR_KEY"
\`\`\`

\`\`\`json
{
  "success": true,
  "planos": [
    { "plano": "5x_7d",   "preco_centavos": 4900,  "preco": "49.00",  "disponivel": true },
    { "plano": "5x_30d",  "preco_centavos": 14900, "preco": "149.00", "disponivel": true },
    { "plano": "20x_30d", "preco_centavos": 24900, "preco": "249.00", "disponivel": true }
  ]
}
\`\`\`

**Códigos de plano válidos:**

| Código      | Descrição                                        |
|-------------|--------------------------------------------------|
| \`5x_7d\`   | 5x uso · 7 dias  (pode estar desativado)         |
| \`5x_30d\`  | 5x uso · 30 dias (2,5M de tokens)                |
| \`20x_30d\` | 20x uso · 30 dias (10M de tokens)                |

---

### GET /saldo

Consulta seu saldo em BRL (centavos).

\`\`\`bash
curl ${base}/saldo -H "X-API-Key: $YOUR_KEY"
\`\`\`

\`\`\`json
{ "success": true, "saldo_centavos": 125000, "saldo": "1250.00" }
\`\`\`

---

### POST /chaves — **emitir uma chave (venda)**

Debita o custo do plano da sua carteira e emite uma chave Claude nova pelo
fornecedor. A chave é retornada **uma única vez** no campo \`codigo\`.

**Request**
\`\`\`bash
curl -X POST ${base}/chaves \\
  -H "X-API-Key: $YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-42-do-meu-sistema" \\
  -d '{
    "plano": "5x_30d",
    "id_cliente": "cliente@email.com"
  }'
\`\`\`

**Body**

| Campo        | Tipo   | Obrigatório | Descrição |
|--------------|--------|-------------|-----------|
| \`plano\`    | string | sim         | Um dos códigos listados em \`/planos\` |
| \`id_cliente\` | string | não       | Identificador do seu cliente (email, id interno etc). Usado só para rastreio. |
| \`request_id\` | string | não       | Chave de idempotência (alternativa ao header \`Idempotency-Key\`). |

**Response — sucesso**
\`\`\`json
{
  "success": true,
  "pedido_id": "e3b0c442-...",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "CLAUDE-XXXXX-XXXXX",
  "provider_key_id": "prov_abc123"
}
\`\`\`

**Response — sem saldo**
\`\`\`json
{
  "success": false,
  "error": "saldo_insuficiente",
  "saldo_centavos": 3000,
  "preco_centavos": 14900
}
\`\`\`
> HTTP 402. **Nenhum débito é feito.** Recarregue e tente novamente.

**Response — falha no fornecedor**
\`\`\`json
{ "success": false, "error": "provider_error", "status": 500, "body": { "..." : "..." } }
\`\`\`
> HTTP 502. **Não descontamos da carteira** e marcamos o pedido como
> \`failed\`. Repita a chamada usando o mesmo \`Idempotency-Key\` para forçar
> uma nova tentativa segura.

---

### GET /chaves

Lista os últimos 50 pedidos.

\`\`\`bash
curl ${base}/chaves -H "X-API-Key: $YOUR_KEY"
\`\`\`

\`\`\`json
{
  "success": true,
  "chaves": [
    {
      "id": "e3b0c442-...",
      "plan_code": "5x_30d",
      "status": "issued",
      "sale_price_cents": 14900,
      "provider_key_id": "prov_abc123",
      "created_at": "2026-07-01T18:00:00Z",
      "error_message": null
    }
  ]
}
\`\`\`

> O campo \`code\` **não** é retornado aqui por segurança. Ele só aparece na
> resposta imediata do \`POST /chaves\` e no webhook.

---

### GET /chaves/{id}

Detalhe de um pedido específico.

\`\`\`bash
curl ${base}/chaves/e3b0c442-... -H "X-API-Key: $YOUR_KEY"
\`\`\`

**Status possíveis:** \`pending\`, \`issued\`, \`failed\`.

---

## 4. Idempotência

Toda venda deve ir com um identificador único, seja pelo header
\`Idempotency-Key\` ou pelo campo \`request_id\` no body. Se a mesma chave
chegar de novo (por retry, timeout de rede, etc.), devolvemos **o mesmo
pedido**, sem cobrar duas vezes:

\`\`\`json
{
  "success": true,
  "idempotent": true,
  "pedido": {
    "id": "e3b0c442-...",
    "plan_code": "5x_30d",
    "status": "issued",
    "sale_price_cents": 14900,
    "provider_key_id": "prov_abc123",
    "code": "CLAUDE-XXXXX-XXXXX"
  }
}
\`\`\`

**Regra prática:** use o ID do pedido no *seu* sistema (\`pedido-42\`,
\`checkout-abc123\`) — assim tentativas duplicadas do seu próprio código
ficam seguras.

---

## 5. Webhook

Configure uma URL na aba **Webhook**. Sempre que uma chave for emitida ou
falhar, enviamos um \`POST\` JSON assinado com HMAC-SHA256 do body usando o
segredo cadastrado.

**Headers enviados**
\`\`\`
Content-Type: application/json
X-Signature: sha256=<hex hmac do body com seu segredo>
\`\`\`

**Body (chave emitida)**
\`\`\`json
{
  "event": "claude.key.issued",
  "pedido_id": "e3b0c442-...",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "CLAUDE-XXXXX-XXXXX",
  "provider_key_id": "prov_abc123",
  "id_cliente": "cliente@email.com",
  "created_at": "2026-07-01T18:00:00Z"
}
\`\`\`

**Body (falha)**
\`\`\`json
{
  "event": "claude.key.failed",
  "pedido_id": "e3b0c442-...",
  "plano": "5x_30d",
  "error": "provider_500"
}
\`\`\`

**Validando a assinatura em Node.js**
\`\`\`js
import crypto from "node:crypto";

function verify(rawBody, signatureHeader, secret) {
  const [, hex] = (signatureHeader || "").split("=");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex"));
}
\`\`\`

---

## 6. Exemplos por linguagem

### Node.js (fetch)
\`\`\`js
const res = await fetch("${base}/chaves", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.CLAUDE_RESELLER_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": "pedido-" + orderId,
  },
  body: JSON.stringify({ plano: "5x_30d", id_cliente: customerEmail }),
});
const data = await res.json();
if (!data.success) throw new Error(data.error);
console.log("chave:", data.codigo);
\`\`\`

### PHP (cURL)
\`\`\`php
$ch = curl_init("${base}/chaves");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "X-API-Key: " . getenv("CLAUDE_RESELLER_KEY"),
    "Content-Type: application/json",
    "Idempotency-Key: pedido-" . \$orderId,
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "plano" => "5x_30d",
    "id_cliente" => \$customerEmail,
  ]),
]);
\$data = json_decode(curl_exec(\$ch), true);
\`\`\`

### Python (requests)
\`\`\`python
import os, requests
r = requests.post(
    "${base}/chaves",
    headers={
        "X-API-Key": os.environ["CLAUDE_RESELLER_KEY"],
        "Content-Type": "application/json",
        "Idempotency-Key": f"pedido-{order_id}",
    },
    json={"plano": "5x_30d", "id_cliente": customer_email},
    timeout=30,
)
data = r.json()
assert data["success"], data
print("chave:", data["codigo"])
\`\`\`

---

## 7. Boas práticas

- **Nunca** exponha a \`X-API-Key\` no front-end. Faça a chamada sempre do seu
  back-end.
- Envie **sempre** \`Idempotency-Key\` na emissão de chave.
- Cheque \`success\` no JSON antes do HTTP status — nossa API sempre retorna
  ambos.
- Salve o \`pedido_id\` no seu banco: ele é a chave para consultar/rastrear.
- Tratamento sugerido para \`saldo_insuficiente\`: pausar novas vendas,
  avisar o admin e recarregar a carteira.
- Configure webhook + retry no seu lado: aceitar 200 rápido e processar
  assíncrono.
`;
  };

  const downloadDocs = () => {
    const md = buildFullDocsMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "api-claude-revendedor.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const copyDocs = async () => {
    await navigator.clipboard.writeText(buildFullDocsMarkdown());
    toast.success("Documentação copiada!");
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="API Claude"
        description="Integre a venda de chaves Claude no seu site, loja ou aplicativo."
        icon={ClaudeIcon}
      />

      <Tabs defaultValue="keys" className="w-full">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><KeyRound className="h-4 w-4" /> Chaves</TabsTrigger>
          <TabsTrigger value="webhook" className="gap-2"><WebhookIcon className="h-4 w-4" /> Webhook</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-4 w-4" /> Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-5 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova chave
            </Button>
          </div>

          {keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
              Nenhuma chave criada ainda.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/60 divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{k.key_prefix}…</span>
                      {k.is_active ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">Ativa</Badge>
                      ) : (
                        <Badge variant="destructive">Revogada</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {k.label ?? "Sem rótulo"} · criada {new Date(k.created_at).toLocaleString("pt-BR")}
                      {k.last_used_at && <> · último uso {new Date(k.last_used_at).toLocaleString("pt-BR")}</>}
                    </div>
                  </div>
                  {k.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => revokeKey(k.id)} className="text-destructive">
                      <Trash2 className="mr-1 h-4 w-4" /> Revogar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="webhook" className="mt-5 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <WebhookIcon className="h-4 w-4 text-primary" /> Webhook de eventos
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enviamos um <code className="text-[11px]">POST</code> JSON assinado com seu segredo no header{" "}
                  <code className="text-[11px]">X-Signature: sha256=…</code> sempre que uma chave é emitida.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>URL do webhook</Label>
                <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://seusite.com/webhooks/claude" />
              </div>
              <div className="space-y-1.5">
                <Label>Segredo (HMAC)</Label>
                <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="qualquer string secreta (guarde no seu servidor)" />
                <p className="text-[11px] text-muted-foreground">
                  Use este segredo para validar a assinatura antes de confiar no payload.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveWebhook} disabled={savingWebhook}>
                  {savingWebhook && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar webhook
                </Button>
                <Button variant="outline" onClick={sendTestWebhook} disabled={testingWebhook || !webhookUrl}>
                  {testingWebhook && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Enviar evento de teste
                </Button>
              </div>
              {testResult && (
                <div className={`text-xs rounded-md border p-2 ${testResult.ok ? "border-emerald-500/40 text-emerald-500" : "border-destructive/40 text-destructive"}`}>
                  {testResult.ok ? "✅" : "⚠️"} {testResult.msg}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3">
              <h4 className="text-sm font-semibold">Formato do evento</h4>
              <pre className="text-[11px] leading-relaxed bg-background/60 border border-border rounded-md p-3 overflow-auto">
{`POST ${webhookUrl || "<sua URL>"}
Content-Type: application/json
X-Signature: sha256=<hex hmac do body>
User-Agent: LovConnect-Webhook/1.0

{
  "event": "claude.key.issued",
  "pedido_id": "uuid",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "sk-ant-...",
  "provider_key_id": "abc123",
  "id_cliente": "cliente@exemplo.com",
  "sent_at": "2026-07-01T12:34:56Z"
}`}
              </pre>
              <h4 className="text-sm font-semibold pt-2">Validando a assinatura (Node.js)</h4>
              <pre className="text-[11px] leading-relaxed bg-background/60 border border-border rounded-md p-3 overflow-auto">
{`import crypto from "node:crypto";

const raw = await req.text();
const expected = "sha256=" + crypto
  .createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(raw).digest("hex");

if (req.headers.get("x-signature") !== expected) {
  return new Response("invalid signature", { status: 401 });
}`}
              </pre>
              <div className="text-[11px] text-muted-foreground">
                Responda <code>2xx</code> em até 8s. Timeouts / 5xx não são reenviados automaticamente por enquanto —
                mantenha idempotência usando <code>pedido_id</code>.
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Documentação completa
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Todos os endpoints, autenticação, webhook, códigos de erro e exemplos por linguagem.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyDocs}>
                <Copy className="mr-1 h-4 w-4" /> Copiar Markdown
              </Button>
              <Button size="sm" onClick={downloadDocs}>
                <Download className="mr-1 h-4 w-4" /> Baixar .md
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4 max-w-3xl">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">URL base</div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs break-all">
                <Code2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1">{FUNCTIONS_BASE}/reseller-claude-api</span>
                <button onClick={() => copyToClipboard(`${FUNCTIONS_BASE}/reseller-claude-api`)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Autenticação</div>
              Envie sua chave em <code className="rounded bg-background/60 px-1 py-0.5 text-xs">X-API-Key: sk_claude_...</code> em toda requisição.
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Endpoints</div>
              <ul className="text-sm space-y-1 font-mono">
                <li><span className="text-emerald-500">GET</span>  /status</li>
                <li><span className="text-emerald-500">GET</span>  /planos</li>
                <li><span className="text-emerald-500">GET</span>  /saldo</li>
                <li><span className="text-amber-500">POST</span> /chaves&nbsp;&nbsp;— emitir chave (venda)</li>
                <li><span className="text-emerald-500">GET</span>  /chaves&nbsp;&nbsp;— listar pedidos</li>
                <li><span className="text-emerald-500">GET</span>  /chaves/{'{id}'}</li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Emitir chave (exemplo)</div>
              <pre className="overflow-auto rounded-lg bg-background/60 p-3 text-xs">
{`curl -X POST ${FUNCTIONS_BASE}/reseller-claude-api/chaves \\
  -H "X-API-Key: $YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-42" \\
  -d '{
    "plano": "5x_30d",
    "id_cliente": "cliente@email.com"
  }'`}
              </pre>
            </div>

            <div className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Planos</div>
              <code>5x_7d</code> · <code>5x_30d</code> · <code>20x_30d</code>. Preço final (com seu markup) em <code>/planos</code>.
            </div>

            <div className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Idempotência</div>
              Sempre envie <code>Idempotency-Key</code> (ou <code>request_id</code> no body). Requisições duplicadas retornam o mesmo pedido sem cobrar de novo.
            </div>

            <div className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Webhook</div>
              Cadastre uma URL na aba <b>Webhook</b>. Enviamos <code>POST</code> assinado com HMAC-SHA256 no header <code>X-Signature</code> quando a chave é emitida ou falha.
            </div>

            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Precisa da versão completa (todos os campos, códigos de erro, exemplos em Node.js/PHP/Python)?
              Use os botões <b>Copiar Markdown</b> ou <b>Baixar .md</b> acima.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal criar chave */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Nova chave de API</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Rótulo (opcional)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="ex: site principal" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createKey} disabled={creating}>
              {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal revelar chave */}
      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Sua nova chave
            </DialogTitle>
            <DialogDescription>Copie agora — ela não será exibida novamente.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Guarde em local seguro. Tratamos essa chave como senha.</span>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-xs break-all select-all">
            {revealed}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealed(null)}>Fechar</Button>
            <Button onClick={() => revealed && copyToClipboard(revealed)}>
              {copied ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar chave</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}