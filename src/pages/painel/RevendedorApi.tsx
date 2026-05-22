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
  Loader2, CheckCircle2, CircleAlert, Plus, Trash2, Webhook, Activity,
  BookOpen, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-api`;

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
function fmtBRL(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ApiKey = {
  id: string; label: string; key_prefix: string; webhook_url: string | null;
  is_active: boolean; last_used_at: string | null; created_at: string;
};
type Usage = {
  created_at: string; endpoint: string; method: string; status_code: number;
  cost_cents: number; license_type: string | null; error_message: string | null;
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
  keys, loading, onNew, onRevoke, onEditWebhook,
}: {
  keys: ApiKey[];
  loading: boolean;
  onNew: () => void;
  onRevoke: (id: string) => void;
  onEditWebhook: (id: string, current: string | null) => void;
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
              <div className="font-display text-base font-bold">Suas API Keys</div>
              <p className="text-xs text-muted-foreground">
                Use estas chaves para gerar licenças via API. Cada chamada debita do seu saldo.
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
                    <th className="px-3 py-2">Webhook</th>
                    <th className="px-3 py-2">Último uso</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium">{k.label}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{k.key_prefix}…</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onEditWebhook(k.id, k.webhook_url)}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
                          title="Editar webhook"
                        >
                          <Webhook className="h-3 w-3" />
                          <span className="max-w-[140px] truncate">{k.webhook_url ?? "—"}</span>
                        </button>
                      </td>
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
                        {k.is_active && (
                          <Button size="sm" variant="ghost" onClick={() => onRevoke(k.id)} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
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
            { n: 1, t: "Autenticação", d: "Inclua o header x-api-key em todas as requisições." },
            { n: 2, t: "Consulte preços", d: "Veja os tipos de licença e preços efetivos do seu nível." },
            { n: 3, t: "Gere licenças", d: "Cada licença gerada debita o saldo automaticamente. Webhook opcional avisa seu sistema." },
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
          body={`curl -X GET "${BASE_URL}?action=status" \\
  -H "x-api-key: SUA_API_KEY"`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Como funciona
          </h4>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>Todas as chamadas usam o header <code className="font-mono bg-secondary/60 px-1 rounded">x-api-key</code>.</li>
            <li>O preço efetivo já considera <strong>desconto do seu nível</strong>.</li>
            <li>Se configurar um <strong>webhook</strong>, ele recebe POST a cada licença gerada.</li>
            <li>Histórico fica disponível em <code className="font-mono bg-secondary/60 px-1 rounded">?action=usage</code>.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" /> Tipos de licença
          </h4>
          <table className="mt-3 w-full text-xs">
            <tbody className="divide-y divide-border">
              {[
                ["pro_1d", "1 dia"],
                ["pro_7d", "7 dias"],
                ["pro_15d", "15 dias"],
                ["pro_30d", "30 dias"],
                ["lifetime", "Vitalícia"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 font-mono text-primary">{k}</td>
                  <td className="py-1.5 text-right text-muted-foreground">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Use <code className="font-mono bg-secondary/60 px-1 rounded">?action=pricing</code> para ver o preço efetivo de cada tipo.
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
        title="GET ?action=status — Status da conta"
        body={`curl -X GET "${BASE_URL}?action=status" \\
  -H "x-api-key: SUA_API_KEY"

# Resposta
{
  "reseller_id": "uuid",
  "balance_cents": 12500,
  "tier": { "name": "Prata", "discount_pct": 10 }
}`}
      />
      <CodeBlock
        title="GET ?action=pricing — Lista de preços efetivos"
        body={`curl -X GET "${BASE_URL}?action=pricing" \\
  -H "x-api-key: SUA_API_KEY"

# Resposta
{
  "items": [
    { "license_type": "pro_30d", "price_cents": 1500 },
    { "license_type": "lifetime", "price_cents": 9900 }
  ]
}`}
      />
      <CodeBlock
        title="POST ?action=generate — Gerar uma licença"
        body={`curl -X POST "${BASE_URL}?action=generate" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "license_type": "pro_30d",
    "display_name": "Cliente X",
    "whatsapp": "5511999999999"
  }'

# Resposta
{
  "license_key": "XXXX-XXXX-XXXX-XXXX",
  "license_type": "pro_30d",
  "expires_at": "2026-...",
  "price_cents": 1500,
  "balance_after_cents": 11000
}`}
      />
      <CodeBlock
        title="POST ?action=generate-trial — Gerar trial"
        body={`curl -X POST "${BASE_URL}?action=generate-trial" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "display_name": "Cliente X",
    "whatsapp": "5511999999999"
  }'`}
      />
      <CodeBlock
        title="POST ?action=revoke-license — Revogar licença"
        body={`curl -X POST "${BASE_URL}?action=revoke-license" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "license_key": "XXXX-XXXX-XXXX-XXXX" }'`}
      />
      <CodeBlock
        title="POST ?action=delete-license — Deletar licença"
        body={`curl -X POST "${BASE_URL}?action=delete-license" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "license_key": "XXXX-XXXX-XXXX-XXXX" }'`}
      />
      <CodeBlock
        title="GET ?action=usage — Histórico de chamadas"
        body={`curl -X GET "${BASE_URL}?action=usage" \\
  -H "x-api-key: SUA_API_KEY"

# Retorna as últimas 200 chamadas`}
      />
      <CodeBlock
        title="POST ?action=webhook — Definir webhook"
        body={`curl -X POST "${BASE_URL}?action=webhook" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "webhook_url": "https://meusistema.com/webhook" }'

# Após cada licença gerada, enviamos:
{
  "event": "license.generated",
  "order_id": "uuid",
  "license_type": "pro_30d",
  "license_key": "XXXX-XXXX-XXXX-XXXX",
  "price_cents": 1500,
  "created_at": "2026-..."
}`}
      />
    </div>
  );
}

function TabErros() {
  const erros: Array<[string, string, string]> = [
    ["401", "MISSING_API_KEY", "Header x-api-key não fornecido"],
    ["401", "INVALID_API_KEY", "API key inválida ou revogada"],
    ["403", "API_DISABLED", "API desativada para este revendedor"],
    ["403", "ACCOUNT_DISABLED", "Conta de revendedor desativada"],
    ["400", "MISSING_FIELDS", "Campos obrigatórios faltando"],
    ["400", "INVALID_LICENSE_TYPE", "Tipo de licença inválido"],
    ["400", "INSUFFICIENT_BALANCE", "Saldo insuficiente para gerar a licença"],
    ["400", "INVALID_WEBHOOK_URL", "URL de webhook inválida"],
    ["404", "LICENSE_NOT_FOUND", "Licença não encontrada"],
    ["409", "LICENSE_ALREADY_REVOKED", "Licença já estava revogada"],
    ["429", "RATE_LIMITED", "Limite de requisições excedido"],
    ["500", "INTERNAL_ERROR", "Erro interno — tente novamente"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold mb-3">Formato de Erro</h3>
        <p className="text-xs text-muted-foreground mb-3">Todas as respostas de erro seguem o mesmo formato:</p>
        <CodeBlock body={`{
  "error": "Mensagem descritiva",
  "code": "CODIGO_DO_ERRO"
}`} />
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
    </div>
  );
}

function TabExemplos() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Fluxo Completo: Gerar e entregar licença</h3>
        <p className="text-xs text-muted-foreground">
          Verifique saldo, gere uma licença e receba o resultado para entregar ao cliente.
        </p>

        <CodeBlock
          title="cURL"
          body={`# 1. Verificar saldo
curl -X GET "${BASE_URL}?action=status" \\
  -H "x-api-key: SUA_API_KEY"

# 2. Gerar licença
curl -X POST "${BASE_URL}?action=generate" \\
  -H "x-api-key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "license_type": "pro_30d",
    "display_name": "Cliente X",
    "whatsapp": "5511999999999"
  }'`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">JavaScript / Node.js</h3>
        <CodeBlock
          body={`const BASE = "${BASE_URL}";
const API_KEY = process.env.RESELLER_API_KEY;

async function gerarLicenca(tipo, cliente, whatsapp) {
  const r = await fetch(\`\${BASE}?action=generate\`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      license_type: tipo,
      display_name: cliente,
      whatsapp,
    }),
  });
  if (!r.ok) throw new Error(\`Erro \${r.status}\`);
  return r.json();
}

const licenca = await gerarLicenca("pro_30d", "Cliente X", "5511999999999");
console.log("Chave gerada:", licenca.license_key);`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">Python</h3>
        <CodeBlock
          body={`import os
import requests

BASE = "${BASE_URL}"
API_KEY = os.environ["RESELLER_API_KEY"]

def gerar_licenca(tipo, cliente, whatsapp):
    r = requests.post(
        f"{BASE}?action=generate",
        headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
        json={"license_type": tipo, "display_name": cliente, "whatsapp": whatsapp},
    )
    r.raise_for_status()
    return r.json()

licenca = gerar_licenca("pro_30d", "Cliente X", "5511999999999")
print("Chave gerada:", licenca["license_key"])`}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold">PHP</h3>
        <CodeBlock
          body={`<?php
$base = "${BASE_URL}";
$apiKey = getenv("RESELLER_API_KEY");

$ch = curl_init("$base?action=generate");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "x-api-key: $apiKey",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "license_type" => "pro_30d",
    "display_name" => "Cliente X",
    "whatsapp" => "5511999999999",
  ]),
]);
$res = json_decode(curl_exec($ch), true);
echo $res["license_key"];`}
        />
      </section>
    </div>
  );
}

function TabHistorico({ usage }: { usage: Usage[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Activity className="h-4 w-4 text-primary" /> Últimas 30 chamadas
      </div>
      <Card className="overflow-hidden">
        {usage.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma chamada ainda.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Quando</th>
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Custo</th>
                <th className="px-4 py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usage.map((u, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(u.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2 font-mono">{u.method} /{u.endpoint}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold ${
                      u.status_code < 300 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                      u.status_code < 500 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                      "bg-destructive/15 text-destructive"
                    }`}>{u.status_code}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{u.cost_cents > 0 ? fmtBRL(u.cost_cents) : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-[260px]">
                    {u.error_message ?? u.license_type ?? "—"}
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

/* ============ MAIN PAGE ============ */
export default function RevendedorApi() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(true);
  const docsRef = useRef<HTMLDivElement>(null);

  // novo / criada
  const [newOpen, setNewOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newWebhook, setNewWebhook] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const [{ data: ks }, { data: us }] = await Promise.all([
      supabase.from("reseller_api_keys").select("*").eq("reseller_id", r.id).eq("scope", "keys").order("created_at", { ascending: false }),
      supabase.from("reseller_api_usage").select("*").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(30),
    ]);
    setKeys((ks ?? []) as ApiKey[]);
    setUsage((us ?? []) as Usage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleNew = () => { setNewLabel("API Licenças"); setNewWebhook(""); setCreatedKey(null); setNewOpen(true); };

  const create = async () => {
    if (!resellerId) return;
    const label = newLabel.trim() || "API Licenças";
    setCreating(true);
    try {
      const key = genKey();
      const hash = await sha256Hex(key);
      const { error } = await supabase.from("reseller_api_keys").insert({
        reseller_id: resellerId,
        label,
        key_prefix: key.slice(0, 12),
        key_hash: hash,
        webhook_url: newWebhook.trim() || null,
        is_active: true,
        scope: "keys",
      });
      if (error) throw error;
      setCreatedKey(key);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar chave");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revogar essa chave? Sistemas que a usam pararão de funcionar.")) return;
    const { error } = await supabase.from("reseller_api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chave revogada");
    load();
  };

  const editWebhook = async (id: string, current: string | null) => {
    const url = prompt("URL do webhook (deixe vazio para remover):", current ?? "");
    if (url === null) return;
    if (url && !/^https?:\/\//.test(url)) return toast.error("URL deve começar com http(s)://");
    const { error } = await supabase.from("reseller_api_keys")
      .update({ webhook_url: url || null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Webhook atualizado");
    load();
  };

  return (
    <PageContainer>
      <PageHeader
        title="API de Chaves"
        description="Gere licenças programaticamente. Cada chamada debita do seu saldo na plataforma."
        actions={<CopyAllDocsButton containerRef={docsRef} fileName="api-licencas-revendedor.md" />}
      />

      <ApiKeysCard
        keys={keys}
        loading={loading}
        onNew={handleNew}
        onRevoke={revoke}
        onEditWebhook={editWebhook}
      />

      <Tabs defaultValue="inicio" className="mt-6 space-y-4">
        <TabsList className="bg-secondary/40">
          <TabsTrigger value="inicio"><Zap className="mr-1.5 h-3.5 w-3.5" /> Início Rápido</TabsTrigger>
          <TabsTrigger value="endpoints"><Code2 className="mr-1.5 h-3.5 w-3.5" /> Endpoints</TabsTrigger>
          <TabsTrigger value="erros"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Erros</TabsTrigger>
          <TabsTrigger value="exemplos"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Exemplos</TabsTrigger>
          <TabsTrigger value="historico"><Activity className="mr-1.5 h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="inicio"><TabInicio /></TabsContent>
        <TabsContent value="endpoints"><TabEndpoints /></TabsContent>
        <TabsContent value="erros"><TabErros /></TabsContent>
        <TabsContent value="exemplos"><TabExemplos /></TabsContent>
        <TabsContent value="historico"><TabHistorico usage={usage} /></TabsContent>
      </Tabs>

      {/* Espelho oculto usado pelo "Copiar documentação completa" para
          coletar o conteúdo de todas as abas de uma vez. */}
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
        <h2>Histórico</h2><TabHistorico usage={usage} />
      </div>

      {/* Modal criar */}
      <Dialog open={newOpen} onOpenChange={(v) => { setNewOpen(v); if (!v) setCreatedKey(null); }}>
        <DialogContent className="bg-card border-border">
          {!createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Gerar chave de API</DialogTitle>
                <DialogDescription>A chave só será exibida uma vez. Guarde com cuidado.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome / identificação</Label>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex: Servidor de produção" />
                </div>
                <div className="space-y-1.5">
                  <Label>Webhook (opcional)</Label>
                  <Input value={newWebhook} onChange={(e) => setNewWebhook(e.target.value)} placeholder="https://meusistema.com/webhook" />
                  <p className="text-[11px] text-muted-foreground">Recebe POST quando uma licença é gerada via essa chave.</p>
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
