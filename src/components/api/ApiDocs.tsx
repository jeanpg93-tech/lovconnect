import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check, KeyRound, Webhook, Code2, ListTree, FileDown } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-api`;

const FULL_DOCS_PROMPT = `# Integração com a API LovMain (Revendedor)

Quero que você implemente, neste projeto Lovable, uma integração completa com a API de revendedor da LovMain. Use as informações abaixo como referência única e crie uma página/serviço funcional que cubra todos os endpoints.

## Configuração

- Base URL: \`${BASE_URL}\`
- Autenticação: header \`x-api-key: SUA_CHAVE\` em TODA requisição.
- A chave deve ser armazenada como secret (NUNCA hardcoded). Em projetos com Lovable Cloud, salve como secret e consuma via edge function. Em frontend puro, peça ao usuário para colar a chave e guarde apenas em memória.
- Content-Type \`application/json\` para POST.

## Endpoints

### GET /status
Retorna dados do revendedor, plano (tier), webhook configurado e saldo.
Resposta:
\`\`\`json
{
  "reseller": { "id": "uuid", "name": "Nome", "slug": "nome" },
  "balance_cents": 12345,
  "balance": 123.45,
  "balance_brl": "123.45",
  "currency": "BRL",
  "tier": { "name": "Bronze", "slug": "bronze", "discount_percent": 0 },
  "webhook_url": null
}
\`\`\`

### GET /balance
Apenas o saldo atual.
\`\`\`json
{ "ok": true, "balance_cents": 12345, "balance": 123.45, "balance_brl": "123.45", "currency": "BRL" }
\`\`\`

### GET /pricing
Lista preços efetivos por tipo de licença, já com desconto de nível e overrides por extensão.
\`\`\`json
{
  "discount_percent": 10,
  "plans": [
    { "license_type": "pro_30d", "label": "Pro 30 dias",
      "base_price_cents": 1500, "min_price_cents": 1000, "final_price_cents": 1350 }
  ],
  "extension_overrides": [
    { "extension_id": "uuid", "license_type": "pro_30d",
      "base_price_cents": 1200, "final_price_cents": 1080 }
  ]
}
\`\`\`

### POST /generate
Gera uma licença e debita o saldo. Dispara o webhook configurado, se houver.
Body:
\`\`\`json
{
  "license_type": "pro_30d",
  "extension_id": "uuid (opcional)",
  "display_name": "Cliente X",
  "whatsapp": "5511999999999"
}
\`\`\`
Tipos aceitos: \`pro_1d\`, \`pro_7d\`, \`pro_15d\`, \`pro_30d\`, \`lifetime\`.

**WhatsApp automático:** se o campo \`whatsapp\` (DDD + número, com ou sem DDI 55) for enviado **e** você tiver o WhatsApp conectado em *Integração WhatsApp* com o toggle "Disparar nas vendas via API" ligado, enviamos a mensagem ao cliente automaticamente. O template usado é o "Mensagem para vendas via API" (ou o de licença, como fallback).

Resposta:
\`\`\`json
{
  "ok": true,
  "order_id": "uuid",
  "license_key": "XXXX-XXXX-XXXX",
  "license_type": "pro_30d",
  "price_cents": 1500,
  "discount_percent": 10
}
\`\`\`

### POST /generate-trial
Gera licença trial gratuita.
Body: \`{ "display_name": "Cliente Teste" }\`
Resposta:
\`\`\`json
{
  "success": true,
  "license_key": "TRIAL-...",
  "type": "trial",
  "minutes": 15,
  "expires_at": "2026-05-02T20:46:51.367Z",
  "used": 1, "limit": 100, "remaining": 99
}
\`\`\`

### GET /usage?limit=50
Histórico das últimas chamadas (limit máximo 200).

### POST /webhook
Define/atualiza a URL de webhook da chave em uso.
Body: \`{ "url": "https://meusistema.com/webhook" }\`

### POST /reset-hwid
Desvincula o HWID de uma licença gerada pela própria chave.
Body: \`{ "license_key": "QL-..." }\`

### POST /revoke-license
Revoga a licença imediatamente. Irreversível, sem reembolso.
Body: \`{ "license_key": "QL-..." }\`

### POST /delete-license
Exclui o registro permanentemente. Use depois de revogar.
Body: \`{ "license_key": "QL-..." }\`

## Webhook recebido após /generate

POST para a URL configurada na chave:
\`\`\`json
{
  "event": "license.generated",
  "order_id": "uuid",
  "reseller_id": "uuid",
  "license_type": "pro_30d",
  "license_key": "XXXX-XXXX-XXXX",
  "price_cents": 1500,
  "created_at": "2026-05-02T..."
}
\`\`\`

## Códigos de erro

- 400 parâmetro inválido (ex.: \`license_type\` ou \`license_key\` ausente)
- 401 chave inválida / ausente
- 402 saldo insuficiente (em /generate)
- 403 extensão não liberada para o revendedor
- 404 licença não pertence à sua chave (em /reset-hwid, /revoke-license, /delete-license)
- 502 falha no provedor (em /generate o saldo é reembolsado automaticamente)

## O que implementar

1. Tela "Saldo": consome \`GET /balance\` e mostra em reais.
2. Tela "Preços": consome \`GET /pricing\` e lista planos + overrides.
3. Formulário "Gerar licença": chama \`POST /generate\` com validação.
4. Formulário "Gerar trial": chama \`POST /generate-trial\`.
5. Tela "Histórico": consome \`GET /usage\`.
6. Ações em uma licença existente: resetar HWID, revogar, excluir.
7. Configurar webhook: \`POST /webhook\`.

Use TypeScript, React + Tailwind + shadcn. Centralize as chamadas em um cliente \`resellerApi.ts\` com tipos para cada endpoint. Trate erros mostrando \`toast\` com a mensagem retornada pela API. Nunca exponha a chave no bundle: armazene como secret e proxie pelas edge functions ou peça ao usuário no runtime.
`;

const CopyFullDocsButton = () => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(FULL_DOCS_PROMPT);
    setCopied(true);
    toast.success("Documentação copiada — cole em outro chat Lovable");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button onClick={copy} variant="default" size="sm" className="gap-2">
      {copied ? <Check className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
      {copied ? "Copiado!" : "Copiar documentação completa"}
    </Button>
  );
};

const Snippet = ({ code, lang = "bash" }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copiado");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 p-4 pt-7 text-xs leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <div className="absolute left-3 top-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-mono">
        {lang}
      </div>
    </div>
  );
};

const Endpoint = ({ method, path, desc }: { method: string; path: string; desc: string }) => (
  <div className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3">
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
        method === "GET" ? "bg-blue-500/15 text-blue-500" : "bg-emerald-500/15 text-emerald-500"
      }`}
    >
      {method}
    </span>
    <div className="flex-1 min-w-0">
      <div className="font-mono text-sm">{path}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
    </div>
  </div>
);

export const ApiDocs = () => (
  <div className="grid gap-6">
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Visão geral</h2>
        </div>
        <CopyFullDocsButton />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Use a API para integrar geração de licenças no seu próprio sistema. Toda chamada é
        autenticada com header <code className="rounded bg-secondary/60 px-1 py-0.5 text-xs">x-api-key</code>{" "}
        e debita o seu saldo conforme os preços configurados (já com desconto do seu nível).
      </p>
      <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
        <span className="font-mono text-muted-foreground">Base URL</span>
        <div className="mt-1 font-mono text-sm break-all">{BASE_URL}</div>
      </div>
    </Card>

    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ListTree className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Endpoints</h2>
      </div>
      <div className="mt-3 space-y-2">
        <Endpoint method="GET" path="/status" desc="Retorna saldo, plano e dados do revendedor." />
        <Endpoint method="GET" path="/balance" desc="Retorna apenas o saldo atual (em centavos e em reais)." />
        <Endpoint method="GET" path="/pricing" desc="Lista preços efetivos por tipo de licença (já com desconto de nível)." />
        <Endpoint method="POST" path="/generate" desc="Gera uma licença e debita saldo. Dispara webhook se configurado." />
        <Endpoint method="POST" path="/generate-trial" desc="Gera uma licença de teste gratuita (trial)." />
        <Endpoint method="GET" path="/usage" desc="Histórico das últimas chamadas (limit até 200)." />
        <Endpoint method="POST" path="/webhook" desc="Define ou atualiza a URL de webhook da chave em uso." />
        <Endpoint method="POST" path="/reset-hwid" desc="Desvincula o HWID de uma licença (cliente poderá reativar em outro dispositivo)." />
        <Endpoint method="POST" path="/revoke-license" desc="Revoga a licença imediatamente. Irreversível e sem reembolso." />
        <Endpoint method="POST" path="/delete-license" desc="Exclui permanentemente o registro da licença. Use após revogar." />
      </div>
    </Card>

    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Code2 className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Exemplos</h2>
      </div>

      <Tabs defaultValue="curl" className="mt-3">
        <TabsList>
          <TabsTrigger value="curl">cURL</TabsTrigger>
          <TabsTrigger value="js">JavaScript</TabsTrigger>
          <TabsTrigger value="php">PHP</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
        </TabsList>

        <TabsContent value="curl" className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Status</div>
            <Snippet code={`curl -H "x-api-key: SUA_CHAVE" \\
  ${BASE_URL}/status`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Saldo</div>
            <Snippet code={`curl -H "x-api-key: SUA_CHAVE" \\
  ${BASE_URL}/balance`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Preços</div>
            <Snippet code={`curl -H "x-api-key: SUA_CHAVE" \\
  ${BASE_URL}/pricing`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Gerar licença</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"license_type":"pro_30d","display_name":"Cliente X","whatsapp":"5511999999999"}' \\
  ${BASE_URL}/generate`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Gerar licença teste (trial)</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"display_name":"Cliente Teste"}' \\
  ${BASE_URL}/generate-trial`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Atualizar webhook</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://meusistema.com/webhook"}' \\
  ${BASE_URL}/webhook`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Resetar HWID</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"license_key":"QL-XXXX..."}' \\
  ${BASE_URL}/reset-hwid`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Revogar licença</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"license_key":"QL-XXXX..."}' \\
  ${BASE_URL}/revoke-license`} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Excluir licença</div>
            <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"license_key":"QL-XXXX..."}' \\
  ${BASE_URL}/delete-license`} />
          </div>
        </TabsContent>

        <TabsContent value="js">
          <Snippet
            lang="javascript"
            code={`const r = await fetch("${BASE_URL}/generate", {
  method: "POST",
  headers: {
    "x-api-key": process.env.RESELLER_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    license_type: "pro_30d",
    display_name: "Cliente X",
    whatsapp: "5511999999999",
  }),
});
const data = await r.json();
console.log(data.license_key);`}
          />
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Gerar licença teste</div>
            <Snippet
              lang="javascript"
              code={`const r = await fetch("${BASE_URL}/generate-trial", {
  method: "POST",
  headers: {
    "x-api-key": process.env.RESELLER_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    display_name: "Cliente Teste",
  }),
});
const data = await r.json();
console.log(data.license_key);`}
            />
          </div>
        </TabsContent>

        <TabsContent value="php">
          <Snippet
            lang="php"
            code={`<?php
$ch = curl_init("${BASE_URL}/generate");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "x-api-key: " . getenv("RESELLER_API_KEY"),
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
        </TabsContent>

        <TabsContent value="python" className="space-y-3">
          <Snippet
            lang="python"
            code={`import os, requests

API = "${BASE_URL}"
HEADERS = {"x-api-key": os.environ["RESELLER_API_KEY"], "Content-Type": "application/json"}

# Gerar licença
r = requests.post(f"{API}/generate", headers=HEADERS, json={
    "license_type": "pro_30d",
    "display_name": "Cliente X",
    "whatsapp": "5511999999999",
}, timeout=30)
print(r.json()["license_key"])

# Resetar HWID
requests.post(f"{API}/reset-hwid", headers=HEADERS, json={"license_key": "QL-XXXX..."})

# Revogar licença (irreversível)
requests.post(f"{API}/revoke-license", headers=HEADERS, json={"license_key": "QL-XXXX..."})

# Excluir licença
requests.post(f"{API}/delete-license", headers=HEADERS, json={"license_key": "QL-XXXX..."})`}
          />
        </TabsContent>
      </Tabs>
    </Card>

    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">Tipos de licença aceitos</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"].map((t) => (
          <div key={t} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-center font-mono text-xs">
            {t}
          </div>
        ))}
      </div>
    </Card>

    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">Resposta de /generate</h2>
      <Snippet
        lang="json"
        code={`{
  "ok": true,
  "order_id": "uuid",
  "license_key": "XXXX-XXXX-XXXX",
  "license_type": "pro_30d",
  "price_cents": 1500,
  "discount_percent": 10
}`}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Códigos de erro comuns: <code className="rounded bg-secondary/60 px-1">400</code> license_key ausente ·{" "}
        <code className="rounded bg-secondary/60 px-1">401</code> chave inválida ·{" "}
        <code className="rounded bg-secondary/60 px-1">402</code> saldo insuficiente ·{" "}
        <code className="rounded bg-secondary/60 px-1">403</code> extensão não liberada ·{" "}
        <code className="rounded bg-secondary/60 px-1">404</code> licença não pertence à sua chave ·{" "}
        <code className="rounded bg-secondary/60 px-1">502</code> falha no provedor (saldo é
        reembolsado automaticamente em /generate).
      </p>
    </Card>

    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">Resposta de /generate-trial</h2>
      <Snippet
        lang="json"
        code={`{
  "success": true,
  "license_key": "TRIAL-7C0AED7AECED4A8C9CE88",
  "type": "trial",
  "minutes": 15,
  "expires_at": "2026-05-02T20:46:51.367Z",
  "used": 1,
  "limit": 100,
  "remaining": 99
}`}
      />
    </Card>

    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">Gestão de licenças</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Os endpoints <code className="rounded bg-secondary/60 px-1">/reset-hwid</code>,{" "}
        <code className="rounded bg-secondary/60 px-1">/revoke-license</code> e{" "}
        <code className="rounded bg-secondary/60 px-1">/delete-license</code> recebem{" "}
        <code className="rounded bg-secondary/60 px-1">{`{"license_key": "QL-..."}`}</code> e
        retornam <code className="rounded bg-secondary/60 px-1">{`{"success": true, ...}`}</code>.
      </p>
      <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-600 dark:text-yellow-400">
        🔒 <strong>Segurança:</strong> só é possível gerenciar licenças que a sua própria chave gerou.
        Tentativas de mexer em licenças de outras chaves retornam <code>404</code>.
      </div>
    </Card>

    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Webhook className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Webhook</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Após uma licença ser gerada com sucesso, enviamos um POST para a URL configurada na chave.
        Configure a URL ao criar a chave ou clicando no ícone de webhook na lista acima.
      </p>
      <div className="mt-3">
        <Snippet
          lang="json"
          code={`POST {sua_url}
Content-Type: application/json

{
  "event": "license.generated",
  "order_id": "uuid",
  "reseller_id": "uuid",
  "license_type": "pro_30d",
  "license_key": "XXXX-XXXX-XXXX",
  "price_cents": 1500,
  "created_at": "2026-05-02T..."
}`}
        />
      </div>
    </Card>
  </div>
);
