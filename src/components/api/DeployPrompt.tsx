import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-api`;

function buildPrompt(baseUrl: string) {
  return `# 🚀 Implantar API de Licenças (LovMain) no meu painel

Você é um engenheiro sênior. Implemente a integração abaixo no projeto **sem remover, renomear ou quebrar nenhuma rota, página, tabela, função ou componente existente**. Apenas **adicione** o que for necessário. Mantenha o estilo visual atual (design tokens, sidebar, layout).

## ⚠️ Regra de ouro — fonte única da verdade
**Toda a lógica de saldo, preços, níveis, tipos de licença, geração de chave e histórico DEVE vir da API do fornecedor descrita abaixo.** É proibido:
- Inventar tipos de licença, preços ou descontos locais (sempre buscar via \`GET /pricing\`).
- Recriar o gerador de licenças, a engine de débito de saldo ou o cálculo de nível no banco da loja.
- Hardcodar valores (preço, saldo, expiração) — sempre buscar via API no momento do uso.
- Criar tabelas que dupliquem dados do fornecedor; se persistir algo, salve **apenas referências** (\`order_id\`, \`license_key\`, \`cost_cents\` em cache) e refaça \`GET /usage\` para a fonte autoritativa.

Em resumo: o painel do cliente é uma **UI + proxy seguro**. Toda decisão de negócio é delegada à API do fornecedor.

## 🎯 Objetivo
Integrar a API de licenças do meu provedor para que meu painel possa:
1. Consultar meu saldo e nível.
2. Listar preços efetivos por tipo de licença.
3. Gerar licenças (debitando do meu saldo).
4. Visualizar histórico de chamadas.
5. Receber webhooks quando uma licença for gerada (opcional).

## 🔑 Credenciais
- **Base URL:** \`${baseUrl}\`
- **Autenticação:** header \`x-api-key: <MINHA_CHAVE>\` em **todas** as requisições.
- A chave deve ser armazenada como **segredo do backend** (nunca exposta no frontend). Crie o secret \`LOVMAIN_API_KEY\` e peça ao usuário para preenchê-lo.

## 📚 Endpoints disponíveis

### GET /status
Retorna saldo, nível e dados do revendedor.
\`\`\`json
{ "balance_cents": 125000, "balance_brl": "R$ 1.250,00",
  "tier": { "name": "Gold", "color": "#FFD700", "discount_pct": 10 } }
\`\`\`

### GET /pricing
Lista de preços efetivos (já com desconto do nível aplicado).
\`\`\`json
{ "items": [
  { "license_type": "premium_30d", "label": "Premium 30 dias",
    "price_cents": 1500, "price_brl": "R$ 15,00" }
] }
\`\`\`

### POST /generate
Gera uma licença e debita do saldo.
**Body:**
\`\`\`json
{ "license_type": "premium_30d", "quantity": 1, "metadata": { "client_ref": "opcional" } }
\`\`\`
**Resposta 200:**
\`\`\`json
{ "ok": true, "order_id": "uuid",
  "licenses": [{ "code": "ABC-123-XYZ", "expires_at": "2026-06-01T..." }],
  "cost_cents": 1500, "balance_after_cents": 123500 }
\`\`\`
**Erros:** \`401\` chave inválida · \`402\` saldo insuficiente · \`403\` chave revogada · \`502\` falha no provedor.

### GET /usage
Histórico das últimas chamadas (\`?limit=50\`, máx 200).

### Webhook (POST do servidor para a URL configurada na chave)
Disparado quando uma licença é gerada. Header de assinatura: \`x-lovmain-signature: sha256=<hex>\`.
**Payload:**
\`\`\`json
{ "event": "license.generated", "order_id": "uuid",
  "license_type": "premium_30d", "licenses": [...], "cost_cents": 1500,
  "occurred_at": "ISO8601" }
\`\`\`

## 🧱 O que adicionar no projeto (sem remover nada do que já existe)

### 1. Backend (edge function)
Crie a edge function **\`lovmain-proxy\`** que:
- Aceita os métodos: \`GET /status\`, \`GET /pricing\`, \`POST /generate\`, \`GET /usage\`.
- Lê o segredo \`LOVMAIN_API_KEY\` e injeta no header \`x-api-key\` ao chamar \`${baseUrl}\`.
- Retorna o JSON cru do upstream + \`status\` HTTP correspondente.
- Implemente CORS liberado para o domínio do app.

### 2. Cliente TypeScript
Crie \`src/integrations/lovmain/client.ts\` com funções tipadas: \`getStatus()\`, \`getPricing()\`, \`generateLicense(input)\`, \`getUsage(limit?)\`. Todas chamando a edge function \`lovmain-proxy\`.

### 3. Páginas novas (NÃO substituir páginas existentes)
- **\`/integracoes/lovmain\`** — Card com saldo atual, nível e botão "Atualizar". Tabela de preços. Formulário "Gerar licença" (select do tipo + quantidade + botão). Tabela com últimas 20 chamadas.
- **\`/integracoes/lovmain/historico\`** — Histórico paginado completo de \`getUsage\`.

### 4. Sidebar / Menu
Adicione um **novo grupo** chamado **"Integrações"** (ou adicione ao grupo já existente se houver) com o item:
- 🔌 **LovMain (Licenças)** → \`/integracoes/lovmain\`

⚠️ **Não remover nem renomear** nenhum item de menu já existente.

### 5. Tratamento de erros
Mostre toasts amigáveis para: \`401\` ("Chave inválida — configure LOVMAIN_API_KEY"), \`402\` ("Saldo insuficiente — recarregue na sua conta LovMain"), \`502\` ("Provedor indisponível, tente novamente").

### 6. Webhook receiver (opcional, recomendado)
Crie a edge function pública \`lovmain-webhook\` que:
- Recebe POST do payload acima.
- Valida a assinatura HMAC \`x-lovmain-signature\` usando o secret \`LOVMAIN_WEBHOOK_SECRET\`.
- Salva em uma nova tabela \`lovmain_webhook_events\` (id, event, payload jsonb, received_at). Adicione RLS adequada.

## ✅ Critérios de aceite
- Build passa sem erros e sem warnings novos.
- Todas as rotas e itens de menu **antigos continuam funcionando**.
- Posso abrir \`/integracoes/lovmain\`, ver saldo, gerar uma licença de teste e ver a chamada aparecer em "Últimas chamadas".
- A chave nunca aparece no bundle do frontend.
- O design segue os tokens do projeto (sem cores hardcoded).

## 🧪 Pós-implementação
Me explique em 5 linhas como obtenho minha \`LOVMAIN_API_KEY\` e como configurar o webhook.
`;
}

export const DeployPrompt = () => {
  const prompt = useMemo(() => buildPrompt(BASE_URL), []);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copiado");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid gap-6">
      <Card className="border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <Rocket className="mt-0.5 h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="font-display text-base font-semibold">Para que serve este prompt</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Este prompt é para você implantar a <strong>API de Licenças</strong> no seu próprio
              <strong> site, sistema ou loja</strong>. Basta colar em qualquer assistente de código
              (Lovable, ChatGPT, Claude, Cursor, Base44, Codex, etc.) e ele gera toda a integração
              — sem alterar nada do que já existe no seu projeto.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Como usar este prompt</h2>
        </div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>
            Crie (ou abra) sua chave de API na aba <strong>Chaves &amp; uso</strong> e copie o valor —
            ela só é exibida uma vez.
          </li>
          <li>
            Abra o painel do <strong>cliente</strong> (no Lovable, ChatGPT, Claude, Cursor, etc.) e
            cole o prompt completo abaixo.
          </li>
          <li>
            Quando a IA pedir, forneça a chave criada. Ela será salva como segredo do backend
            (nunca no frontend).
          </li>
          <li>
            Opcional: configure também o <strong>webhook</strong> apontando para a edge function que
            o prompt cria, para receber eventos em tempo real.
          </li>
          <li>
            Pronto — o painel do cliente terá novas páginas e itens de menu, sem alterar nada do
            que já existia.
          </li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">O que o prompt vai criar</h2>
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Edge function proxy <code className="font-mono">lovmain-proxy</code></li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Cliente TypeScript tipado</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página <code className="font-mono">/integracoes/lovmain</code></li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página de histórico de chamadas</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Item de menu novo (sem remover os existentes)</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Receiver de webhook + tabela de eventos</li>
        </ul>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Prompt de implantação</h2>
          </div>
          <Button onClick={copyAll} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copiado</> : <><Copy className="mr-1.5 h-4 w-4" /> Copiar prompt</>}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pronto para colar no Lovable, ChatGPT, Claude, Cursor, Gemini ou qualquer assistente de
          código. Ele já contém a Base URL da sua instância.
        </p>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
{prompt}
        </pre>
      </Card>
    </div>
  );
};
