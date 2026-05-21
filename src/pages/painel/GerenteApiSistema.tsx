import { useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, KeyRound, Webhook, Code2, Layout } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-api`;

const Snippet = ({ code, lang = "bash" }: { code: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true); toast.success("Copiado");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 p-4 text-xs leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <div className="absolute left-3 top-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-mono">{lang}</div>
    </div>
  );
};

const Endpoint = ({ method, path, desc }: { method: string; path: string; desc: string }) => (
  <div className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3">
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
      method === "GET" ? "bg-blue-500/15 text-blue-500" : "bg-emerald-500/15 text-emerald-500"
    }`}>{method}</span>
    <div className="flex-1 min-w-0">
      <div className="font-mono text-sm">{path}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
    </div>
  </div>
);

export default function GerenteApiSistema() {
  return (
    <PageContainer>
      <PageHeader
        title="Integrações"
        description="Documentação da API pública que revendedores podem integrar em sistemas externos."
      />

      <div className="grid gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Visão geral</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Cada revendedor pode gerar suas próprias chaves de API em <code className="rounded bg-secondary/60 px-1 py-0.5 text-xs">/painel/revendedor/api</code>.
            As chamadas são autenticadas via header <code className="rounded bg-secondary/60 px-1 py-0.5 text-xs">x-api-key</code>,
            debitam saldo conforme os preços configurados, e podem disparar webhooks após gerar licenças.
          </p>
          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
            <span className="font-mono text-muted-foreground">Base URL</span>
            <div className="mt-1 font-mono text-sm break-all">{BASE_URL}</div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Endpoints</h2>
          <div className="mt-3 space-y-2">
            <Endpoint method="GET" path="/status" desc="Retorna saldo, plano e dados do revendedor." />
            <Endpoint method="GET" path="/pricing" desc="Lista preços efetivos por tipo de licença (já com desconto de nível)." />
            <Endpoint method="POST" path="/generate" desc="Gera uma licença e debita saldo. Dispara webhook se configurado." />
            <Endpoint method="GET" path="/usage" desc="Histórico das últimas chamadas (limit=200)." />
            <Endpoint method="POST" path="/webhook" desc="Define/atualiza a URL de webhook da chave." />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Configuração Dinâmica (White-label)</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Para que a extensão mude de nome, cores e logo conforme a personalização do revendedor, sua <strong>base da extensão</strong> deve consumir este endpoint ao iniciar:
          </p>
          <div className="mt-3 space-y-3">
            <Endpoint method="GET" path="/extension-config" desc="Retorna as cores, nome e logo baseados no revendedor que vendeu a licença." />
            <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
              <span className="font-mono text-muted-foreground">Exemplo de chamada da extensão</span>
              <Snippet code={`curl "${BASE_URL.replace("/reseller-api", "/extension-config")}?license_key=CHAVE_DO_CLIENTE"`} />
            </div>
            <div className="mt-2 rounded-md border border-border bg-card/40 p-3 text-xs">
              <span className="font-mono text-muted-foreground font-semibold">Resposta sugerida</span>
              <Snippet lang="json" code={`{
  "display_name": "Nome Personalizado",
  "primary_color": "#7C3AED",
  "secondary_color": "#F9FAFB",
  "logo_url": "https://...",
  "favicon_url": "https://..."
}`} />
            </div>
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
            </TabsList>

            <TabsContent value="curl" className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Status</div>
                <Snippet code={`curl -H "x-api-key: SUA_CHAVE" \\\n  ${BASE_URL}/status`} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Gerar licença</div>
                <Snippet code={`curl -X POST -H "x-api-key: SUA_CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d '{"license_type":"pro_30d","display_name":"Cliente X","whatsapp":"5511999999999"}' \\\n  ${BASE_URL}/generate`} />
              </div>
            </TabsContent>

            <TabsContent value="js">
              <Snippet lang="javascript" code={`const r = await fetch("${BASE_URL}/generate", {
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
console.log(data.license_key);`} />
            </TabsContent>

            <TabsContent value="php">
              <Snippet lang="php" code={`<?php
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
echo $res["license_key"];`} />
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Webhook</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Após uma licença ser gerada com sucesso, enviamos um POST para a URL configurada na chave:
          </p>
          <div className="mt-3">
            <Snippet lang="json" code={`{
  "event": "license.generated",
  "order_id": "uuid",
  "reseller_id": "uuid",
  "license_type": "pro_30d",
  "license_key": "XXXX-XXXX-XXXX",
  "price_cents": 1500,
  "created_at": "2026-..."
}`} />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
