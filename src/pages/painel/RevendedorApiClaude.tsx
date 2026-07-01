import { useEffect, useRef, useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import CopyAllDocsButton from "@/components/api/CopyAllDocsButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  KeyRound, Copy, Shield, Zap, AlertTriangle, Terminal, Code2,
  Loader2, CheckCircle2, CircleAlert, Plus, Trash2, Webhook, BookOpen, Rocket,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DeployClaudePrompt } from "@/components/api/DeployClaudePrompt";
import { WalletBalanceRuleNotice } from "@/components/painel/WalletBalanceRuleNotice";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-claude-api`;

/* ---------- helpers ---------- */
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genKey() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sk_claude_${hex}`;
}
function genWebhookSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ApiKey = {
  id: string; label: string | null; key_prefix: string;
  key_full: string | null;
  webhook_url: string | null; webhook_secret: string | null;
  is_active: boolean; last_used_at: string | null; created_at: string; revoked_at: string | null;
};

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

/* ---------- API KEYS CARD ---------- */
function ApiKeysCard({
  keys, loading, onNew, onRevoke,
}: {
  keys: ApiKey[];
  loading: boolean;
  onNew: () => void;
  onRevoke: (id: string) => void;
}) {
  const active = keys.filter((k) => k.is_active);
  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold">Suas API Keys — Claude</div>
              <p className="text-xs text-muted-foreground">
                Use estas chaves para emitir chaves Claude via API. Cada venda debita da sua carteira.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {active.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> {active.length} ativa{active.length > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <CircleAlert className="h-3 w-3" /> Sem chave
              </span>
            )}
            <Button size="sm" onClick={onNew} className="h-10 w-full bg-primary px-4 text-xs font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary/90 sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" /> Gerar chave API
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-background/60 px-3 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center text-xs text-muted-foreground">
              Nenhuma chave criada ainda. Clique em <strong>Gerar chave API</strong> para começar.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-background/60">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Prefixo</th>
                    <th className="px-3 py-2">Último uso</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium">{k.label ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{k.key_prefix}…</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString("pt-BR") : "Nunca"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {k.is_active ? (
                          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Ativa</span>
                        ) : (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Revogada</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (k.key_full) {
                                navigator.clipboard.writeText(k.key_full);
                                toast.success("Chave completa copiada");
                              } else {
                                navigator.clipboard.writeText(k.key_prefix);
                                toast.warning("Só o prefixo estava disponível (chave antiga)");
                              }
                            }}
                            className="h-6 w-6 p-0"
                            title={k.key_full ? "Copiar chave completa" : "Copiar prefixo (chave antiga)"}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          {k.is_active && (
                            <Button size="sm" variant="ghost" onClick={() => onRevoke(k.id)} className="h-6 w-6 p-0 text-destructive hover:text-destructive" title="Revogar">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Shield className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          Mantenha suas API keys em segredo. Nunca as compartilhe ou exponha em código público.
          A chave completa só é exibida uma vez na criação.
        </p>
      </div>
    </Card>
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
            { n: 2, t: "Consulte planos", d: "Veja os planos disponíveis e o seu preço final (com markup)." },
            { n: 3, t: "Emita chaves", d: "POST /chaves debita sua carteira e devolve a chave Claude." },
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
        <CodeBlock title="URL Base" body={BASE_URL} />
        <CodeBlock
          title="Exemplo de requisição"
          body={`curl -X GET "${BASE_URL}/status" \\
  -H "X-API-Key: SUA_API_KEY"`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Como funciona
          </h4>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Todas as chamadas usam o header <code className="font-mono bg-secondary/60 px-1 rounded">X-API-Key</code>.</li>
            <li>O preço em <code className="font-mono bg-secondary/60 px-1 rounded">/planos</code> já inclui o seu <strong>markup</strong>.</li>
            <li>Envie sempre <code className="font-mono bg-secondary/60 px-1 rounded">Idempotency-Key</code> ao emitir chave.</li>
            <li>Se configurar um <strong>webhook</strong>, ele recebe POST assinado a cada chave emitida.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" /> Planos disponíveis
          </h4>
          <table className="mt-3 w-full text-xs">
            <tbody className="divide-y divide-border">
              {[
                ["pro_30d", "Pro · 30 dias · 500K tokens"],
                ["5x_30d", "5x · 30 dias · 2,5M tokens"],
                ["20x_30d", "20x · 30 dias · 10M tokens"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 font-mono text-primary">{k}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Use <code className="font-mono bg-secondary/60 px-1 rounded">GET /planos</code> para ver o preço final de cada um.
          </p>
        </div>
      </div>
    </div>
  );
}

function TabEndpoints() {
  return (
    <div className="space-y-4">
      <CodeBlock
        title="GET /status — Status da conta"
        body={`curl -X GET "${BASE_URL}/status" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{ "success": true, "claude_enabled": true }`}
      />
      <CodeBlock
        title="GET /planos — Catálogo com seu preço final"
        body={`curl -X GET "${BASE_URL}/planos" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "planos": [
    { "plano": "pro_30d",  "preco_centavos": 8000,  "preco": "80.00",  "disponivel": true },
    { "plano": "5x_30d",   "preco_centavos": 14900, "preco": "149.00", "disponivel": true },
    { "plano": "20x_30d",  "preco_centavos": 24900, "preco": "249.00", "disponivel": true }
  ]
}`}
      />
      <CodeBlock
        title="GET /saldo — Saldo da carteira"
        body={`curl -X GET "${BASE_URL}/saldo" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{ "success": true, "saldo_centavos": 125000, "saldo": "1250.00" }`}
      />
      <CodeBlock
        title="POST /chaves — Emitir chave (venda)"
        body={`curl -X POST "${BASE_URL}/chaves" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-42" \\
  -d '{
    "plano": "5x_30d",
    "id_cliente": "cliente@email.com"
  }'

# Resposta
{
  "success": true,
  "pedido_id": "uuid",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "CLAUDE-XXXXX-XXXXX",
  "provider_key_id": "prov_abc123"
}`}
      />
      <CodeBlock
        title="GET /chaves — Últimos 50 pedidos"
        body={`curl -X GET "${BASE_URL}/chaves" \\
  -H "X-API-Key: SUA_API_KEY"

# O campo "code" NÃO volta aqui por segurança.
# Ele só é retornado na resposta imediata do POST /chaves e no webhook.`}
      />
      <CodeBlock
        title="GET /chaves/{id} — Detalhe de um pedido"
        body={`curl -X GET "${BASE_URL}/chaves/PEDIDO_ID" \\
  -H "X-API-Key: SUA_API_KEY"

# status: pending | issued | redeemed | cancel_requested |
#         cancelled | cancel_rejected | refunded | expired | failed`}
      />
      <CodeBlock
        title="POST /chaves/{id}/cancelar — Cancelar / Revogar chave"
        body={`curl -X POST "${BASE_URL}/chaves/PEDIDO_ID/cancelar" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "force": false }'

# Regra dos 7 dias
# - Dentro dos 7 dias após emissão: cancelamento com ESTORNO AUTOMÁTICO
#   (o valor pago volta para sua carteira do painel).
# - Após 7 dias: retorna 409 refund_window_expired. Se quiser cancelar mesmo
#   assim, reenvie com "force": true — a chave é revogada, mas NÃO há estorno.
#
# Resposta (ok)
# { "success": true, "refund_cents": 14900, "refund_waived": false }
#
# Resposta (fora do prazo, sem force)
# { "success": false, "error": "refund_window_expired",
#   "age_days": 12, "refund_window_days": 7 }`}
      />
    </div>
  );
}

function TabErros() {
  const erros: Array<[string, string, string]> = [
    ["401", "Missing X-API-Key", "Header X-API-Key não fornecido"],
    ["401", "API Key inválida ou revogada", "Chave inválida ou desativada"],
    ["403", "Revendedor inativo", "Sua conta está inativa"],
    ["403", "activation_required", "Ativação do painel pendente"],
    ["403", "Claude API não habilitada", "Produto Claude não liberado para você"],
    ["400", "invalid_plano", "Código de plano inválido"],
    ["400", "plano_indisponivel", "Plano temporariamente desativado"],
    ["402", "saldo_insuficiente", "Carteira não cobre o custo — não descontamos nada"],
    ["404", "Pedido não encontrado", "ID de pedido inexistente"],
    ["500", "provider_not_configured", "Fornecedor não configurado — contate o suporte"],
    ["502", "provider_error", "Fornecedor retornou erro — carteira não foi debitada"],
    ["502", "provider_network_error", "Falha de rede com o fornecedor — retry seguro com mesma Idempotency-Key"],
    ["409", "refund_window_expired", "Cancelamento após 7 dias — reenvie com force=true para revogar sem estorno"],
    ["409", "invalid_status", "Pedido não está em estado cancelável (ex.: já cancelado)"],
    ["422", "missing_provider_key_id", "Pedido sem identificação da chave no fornecedor"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold mb-3">Formato de Erro</h3>
        <p className="text-xs text-muted-foreground mb-3">Todas as respostas de erro seguem o mesmo formato:</p>
        <CodeBlock body={`{ "success": false, "error": "codigo_do_erro" }`} />
      </div>

      <div>
        <h3 className="font-display text-base font-semibold mb-3">Códigos de Erro</h3>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 w-16">HTTP</th>
                <th className="px-4 py-2">Erro</th>
                <th className="px-4 py-2">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {erros.map(([http, code, desc], i) => (
                <tr key={i} className="hover:bg-secondary/30">
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
    </div>
  );
}

function TabExemplos() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Fluxo completo: emitir e entregar chave Claude</h3>
        <p className="text-xs text-muted-foreground">
          Verifique saldo, emita uma chave e entregue o <code>codigo</code> ao cliente.
        </p>

        <CodeBlock
          title="cURL"
          body={`# 1. Verificar saldo
curl -X GET "${BASE_URL}/saldo" -H "X-API-Key: SUA_API_KEY"

# 2. Emitir chave
curl -X POST "${BASE_URL}/chaves" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-42" \\
  -d '{ "plano": "5x_30d", "id_cliente": "cliente@email.com" }'`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">JavaScript / Node.js</h3>
        <CodeBlock
          body={`const BASE = "${BASE_URL}";
const API_KEY = process.env.CLAUDE_RESELLER_KEY;

async function emitirChave(plano, idCliente, pedidoId) {
  const r = await fetch(\`\${BASE}/chaves\`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": "pedido-" + pedidoId,
    },
    body: JSON.stringify({ plano, id_cliente: idCliente }),
  });
  const data = await r.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

const res = await emitirChave("5x_30d", "cliente@email.com", "42");
console.log("Chave:", res.codigo);`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Python</h3>
        <CodeBlock
          body={`import os, requests

BASE = "${BASE_URL}"
API_KEY = os.environ["CLAUDE_RESELLER_KEY"]

def emitir_chave(plano, id_cliente, pedido_id):
    r = requests.post(
        f"{BASE}/chaves",
        headers={
            "X-API-Key": API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": f"pedido-{pedido_id}",
        },
        json={"plano": plano, "id_cliente": id_cliente},
        timeout=30,
    )
    data = r.json()
    assert data["success"], data
    return data

res = emitir_chave("5x_30d", "cliente@email.com", "42")
print("Chave:", res["codigo"])`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">PHP</h3>
        <CodeBlock
          body={`<?php
$base = "${BASE_URL}";
$apiKey = getenv("CLAUDE_RESELLER_KEY");
$pedidoId = "42";

$ch = curl_init("$base/chaves");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "X-API-Key: $apiKey",
    "Content-Type: application/json",
    "Idempotency-Key: pedido-$pedidoId",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "plano" => "5x_30d",
    "id_cliente" => "cliente@email.com",
  ]),
]);
$res = json_decode(curl_exec($ch), true);
echo $res["codigo"];`}
        />
      </section>
    </div>
  );
}

function TabWebhook({
  webhookUrl, setWebhookUrl, webhookSecret, setWebhookSecret,
  saving, testing, onSave, onTest, testResult,
}: {
  webhookUrl: string; setWebhookUrl: (v: string) => void;
  webhookSecret: string; setWebhookSecret: (v: string) => void;
  saving: boolean; testing: boolean;
  onSave: () => void; onTest: () => void;
  testResult: null | { ok: boolean; msg: string };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" /> Webhook de eventos
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Enviamos um <code className="text-[11px]">POST</code> JSON assinado com seu segredo no header{" "}
            <code className="text-[11px]">X-Signature: sha256=…</code> sempre que uma chave é emitida.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>URL do webhook</Label>
          <Input
            type="url"
            name="claude_webhook_url"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://seusite.com/webhooks/claude"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Segredo HMAC · <code className="font-mono text-[11px]">CLAUDE_WEBHOOK_SECRET</code></Label>
          <div className="flex gap-2">
            <Input
              type="text"
              name="claude_webhook_secret"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="qualquer string secreta (guarde no seu servidor)"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setWebhookSecret(genWebhookSecret())}>
              Gerar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!webhookSecret}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(webhookSecret);
                  toast.success("Segredo HMAC copiado");
                } catch {
                  toast.error("Não foi possível copiar");
                }
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Este é o valor que sua loja pede como <code className="font-mono">CLAUDE_WEBHOOK_SECRET</code>.
            Usado para validar a assinatura <code className="font-mono">x-signature</code> antes de confiar no payload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar webhook
          </Button>
          <Button variant="outline" onClick={onTest} disabled={testing || !webhookUrl}>
            {testing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Enviar evento de teste
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
  );
}

/* ============ MAIN PAGE ============ */
export default function RevendedorApiClaude() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const docsRef = useRef<HTMLDivElement>(null);

  // criar / revelar
  const [newOpen, setNewOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    let { data: ks } = await supabase
      .from("reseller_claude_api_keys")
      .select("id, label, key_prefix, key_full, webhook_url, webhook_secret, is_active, last_used_at, created_at, revoked_at")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false });
    // Garante linha dedicada ao webhook (com HMAC auto-gerado), sem expor uma API key.
    const WEBHOOK_LABEL = "__webhook_config__";
    let webhookRow = (ks ?? []).find((k: any) => k.label === WEBHOOK_LABEL) as any;
    if (!webhookRow) {
      const secret = genWebhookSecret();
      const dummy = genKey();
      const dummyHash = await sha256Hex(dummy + ":webhook-only");
      const { data: inserted, error } = await supabase
        .from("reseller_claude_api_keys")
        .insert({
          reseller_id: r.id,
          label: WEBHOOK_LABEL,
          key_prefix: "webhook",
          key_hash: dummyHash,
          webhook_secret: secret,
          is_active: false,
          revoked_at: new Date().toISOString(),
        })
        .select("id, label, key_prefix, key_full, webhook_url, webhook_secret, is_active, last_used_at, created_at, revoked_at")
        .maybeSingle();
      if (!error && inserted) {
        webhookRow = inserted;
        ks = [inserted, ...(ks ?? [])];
      }
    }
    // Esconde a linha interna do webhook na tabela de chaves.
    const visible = (ks ?? []).filter((k: any) => k.label !== WEBHOOK_LABEL);
    setKeys(visible as ApiKey[]);
    if (webhookRow) {
      setWebhookUrl(webhookRow.webhook_url ?? "");
      setWebhookSecret(webhookRow.webhook_secret ?? genWebhookSecret());
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const handleNew = () => { setNewLabel("API Claude"); setCreatedKey(null); setNewOpen(true); };

  const create = async () => {
    if (!resellerId) return;
    const label = newLabel.trim() || "API Claude";
    setCreating(true);
    try {
      const key = genKey();
      const hash = await sha256Hex(key);
      const secret = webhookSecret || genWebhookSecret();
      const { error } = await supabase.from("reseller_claude_api_keys").insert({
        reseller_id: resellerId,
        label,
        key_prefix: key.slice(0, 16),
        key_hash: hash,
        key_full: key,
        webhook_secret: secret,
        is_active: true,
      });
      if (error) throw error;
      setCreatedKey(key);
      setWebhookSecret(secret);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar chave");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revogar essa chave? Sistemas que a usam pararão de funcionar.")) return;
    const { error } = await supabase.from("reseller_claude_api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chave revogada");
    load();
  };

  const saveWebhook = async () => {
    if (!resellerId) return;
    setSavingWebhook(true);
    const { error } = await supabase
      .from("reseller_claude_api_keys")
      .update({ webhook_url: webhookUrl || null, webhook_secret: webhookSecret || null })
      .eq("reseller_id", resellerId)
      .eq("label", "__webhook_config__");
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

  return (
    <PageContainer>
      <PageHeader
        title="API Claude"
        description="Emita chaves Claude programaticamente. Cada venda debita da sua carteira."
        icon={ClaudeIcon}
        actions={<CopyAllDocsButton containerRef={docsRef} fileName="api-claude-revendedor.md" />}
      />

      <div className="mt-4">
        <WalletBalanceRuleNotice product="chaves Claude" />
      </div>

      <div className="mt-4">
        <ApiKeysCard keys={keys} loading={loading} onNew={handleNew} onRevoke={revoke} />
      </div>

      <Tabs defaultValue="inicio" className="mt-6 space-y-4">
        <TabsList className="bg-secondary/40">
          <TabsTrigger value="inicio"><Zap className="mr-1.5 h-3.5 w-3.5" /> Início Rápido</TabsTrigger>
          <TabsTrigger value="endpoints"><Code2 className="mr-1.5 h-3.5 w-3.5" /> Endpoints</TabsTrigger>
          <TabsTrigger value="erros"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Erros</TabsTrigger>
          <TabsTrigger value="exemplos"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Exemplos</TabsTrigger>
          <TabsTrigger value="webhook"><Webhook className="mr-1.5 h-3.5 w-3.5" /> Webhook</TabsTrigger>
          <TabsTrigger value="implantar"><Rocket className="mr-1.5 h-3.5 w-3.5" /> Prompt para Implantar API</TabsTrigger>
        </TabsList>

        <TabsContent value="inicio"><TabInicio /></TabsContent>
        <TabsContent value="endpoints"><TabEndpoints /></TabsContent>
        <TabsContent value="erros"><TabErros /></TabsContent>
        <TabsContent value="exemplos"><TabExemplos /></TabsContent>
        <TabsContent value="webhook">
          <TabWebhook
            webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
            webhookSecret={webhookSecret} setWebhookSecret={setWebhookSecret}
            saving={savingWebhook} testing={testingWebhook}
            onSave={saveWebhook} onTest={sendTestWebhook}
            testResult={testResult}
          />
        </TabsContent>
        <TabsContent value="implantar"><DeployClaudePrompt /></TabsContent>
      </Tabs>

      {/* Espelho oculto usado pelo "Copiar documentação completa" */}
      <div
        ref={docsRef}
        aria-hidden="true"
        className="sr-only"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
      >
        <h2>Início Rápido</h2><TabInicio />
        <h2>Endpoints</h2><TabEndpoints />
        <h2>Erros</h2><TabErros />
        <h2>Exemplos</h2><TabExemplos />
      </div>

      {/* Modal criar */}
      <Dialog open={newOpen} onOpenChange={(v) => { setNewOpen(v); if (!v) setCreatedKey(null); }}>
        <DialogContent className="bg-card border-border">
          {!createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Gerar chave de API Claude</DialogTitle>
                <DialogDescription>A chave só será exibida uma vez. Guarde com cuidado.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome / identificação</Label>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex: Servidor de produção" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
                <Button onClick={create} disabled={creating} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar chave API"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Sua nova chave</DialogTitle>
                <DialogDescription className="text-amber-500">
                  Copie agora — ela não será exibida novamente.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Guarde em local seguro. Tratamos essa chave como senha.</span>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="break-all font-mono text-xs">{createdKey}</div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => { if (createdKey) { navigator.clipboard.writeText(createdKey); toast.success("Copiada"); } }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Copy className="mr-1.5 h-4 w-4" /> Copiar chave
                </Button>
                <Button variant="ghost" onClick={() => { setNewOpen(false); setCreatedKey(null); }}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}