import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-claude-api`;

function buildPrompt(baseUrl: string) {
  return `# 🤖 Implantar API Claude (revenda) no meu painel

Você é um engenheiro sênior. Implemente a integração abaixo no projeto **sem remover, renomear ou quebrar nenhuma rota, página, tabela, função ou componente existente**. Apenas **adicione** o que for necessário. Mantenha o estilo visual atual (design tokens, sidebar, layout).

## ⚠️ Regra de ouro — fonte única da verdade
**Toda a lógica de saldo, planos, preços, emissão de chave Claude e histórico DEVE vir da API do fornecedor descrita abaixo.** É proibido:
- Inventar planos, preços ou limites locais (sempre buscar via \`GET /planos\`).
- Recriar a engine de emissão/débito no banco da loja.
- Hardcodar valores (preço, saldo, expiração) — sempre buscar via API no momento do uso.
- Criar tabelas que dupliquem dados do fornecedor; se persistir algo, salve **apenas referências** (\`order_id\`, \`chave\`) e refaça \`GET /chaves\` para a fonte autoritativa.

Em resumo: o painel do cliente é uma **UI + proxy seguro**. Toda decisão de negócio é delegada à API do fornecedor.

## 🎯 Objetivo
Integrar a API Claude do meu provedor para que meu painel possa:
1. Consultar meu saldo.
2. Listar planos ativos e preços efetivos.
3. Emitir chaves Claude (debitando do meu saldo).
4. Visualizar histórico de pedidos.
5. Receber webhooks quando uma chave for emitida (opcional).

## 🔑 Credenciais
- **Base URL:** \`${baseUrl}\`
- **Autenticação:** header \`x-api-key: <MINHA_CHAVE>\` em **todas** as requisições.
- A chave deve ser armazenada como **segredo do backend** (nunca exposta no frontend). Crie o secret \`CLAUDE_RESELLER_API_KEY\` e peça ao usuário para preenchê-lo.

## 📚 Endpoints disponíveis

### GET /saldo
Retorna o saldo do revendedor.
\`\`\`json
{ "balance_cents": 125000, "balance_brl": "R$ 1.250,00" }
\`\`\`

### GET /planos
Lista de planos ativos com preço efetivo.
\`\`\`json
{ "items": [
  { "plan_code": "pro_30d",  "label": "Pro · 30 dias",  "price_cents": 8000,  "price_brl": "R$ 80,00" },
  { "plan_code": "5x_30d",   "label": "5x · 30 dias",   "price_cents": 15000, "price_brl": "R$ 150,00" },
  { "plan_code": "20x_30d",  "label": "20x · 30 dias",  "price_cents": 25000, "price_brl": "R$ 250,00" }
] }
\`\`\`

### POST /chaves
Emite uma chave Claude e debita do saldo.
**Body:**
\`\`\`json
{ "plan_code": "pro_30d",
  "customer_name": "Cliente João",
  "customer_email": "opcional@dominio.com",
  "customer_whatsapp": "5511999999999",
  "request_id": "uuid-v4-idempotencia" }
\`\`\`
**Resposta 200:**
\`\`\`json
{ "ok": true, "order_id": "uuid", "plan_code": "pro_30d",
  "chave": "sk-ant-api03-...", "expires_at": "2026-06-01T...",
  "cost_cents": 8000, "balance_after_cents": 117000 }
\`\`\`
> ⚠️ A \`chave\` só é retornada nesta resposta e no webhook — armazene com segurança.

**Erros:** \`401\` chave inválida · \`402\` saldo insuficiente · \`403\` chave revogada · \`409\` \`request_id\` já usado · \`502\` falha no provedor.

### GET /chaves
Últimos 50 pedidos (\`?limit=50\`, máx 200). Não devolve o valor da \`chave\`.

### GET /chaves/{id}
Detalhe de um pedido específico.

### Webhook (POST do servidor para a URL configurada na chave)
Disparado quando uma chave é emitida. Header de assinatura: \`x-signature: sha256=<hex>\`.
**Payload:**
\`\`\`json
{ "event": "claude.key.issued", "order_id": "uuid",
  "plan_code": "pro_30d", "chave": "sk-ant-api03-...",
  "cost_cents": 8000, "occurred_at": "ISO8601" }
\`\`\`

## 🧱 O que adicionar no projeto (sem remover nada do que já existe)

### 1. Backend (edge function)
Crie a edge function **\`claude-proxy\`** que:
- Aceita: \`GET /saldo\`, \`GET /planos\`, \`POST /chaves\`, \`GET /chaves\`, \`GET /chaves/{id}\`.
- Lê o segredo \`CLAUDE_RESELLER_API_KEY\` e injeta no header \`x-api-key\` ao chamar \`${baseUrl}\`.
- Retorna o JSON cru do upstream + \`status\` HTTP correspondente.
- CORS liberado para o domínio do app.

### 2. Cliente TypeScript
Crie \`src/integrations/claude/client.ts\` com funções tipadas: \`getSaldo()\`, \`getPlanos()\`, \`emitirChave(input)\`, \`listarPedidos(limit?)\`, \`getPedido(id)\`. Todas chamando a edge function \`claude-proxy\`.

### 3. Páginas novas (NÃO substituir páginas existentes)
- **\`/integracoes/claude\`** — Card com saldo. Grid dos planos ativos (buscados de \`/planos\`). Formulário "Emitir chave" (plano + dados do cliente + botão). Modal exibindo a \`chave\` uma única vez, com botão de copiar. Tabela com últimos 20 pedidos.
- **\`/integracoes/claude/historico\`** — Histórico paginado completo.

### 4. Sidebar / Menu
Adicione um novo item ao grupo **"Integrações"** (crie o grupo se não existir):
- 🤖 **Claude (Revenda)** → \`/integracoes/claude\`

⚠️ **Não remover nem renomear** nenhum item de menu já existente.

### 5. Idempotência
Sempre gere um \`request_id\` UUID v4 do lado do backend antes de chamar \`POST /chaves\`. Se o usuário reenviar o formulário, reutilize o mesmo \`request_id\` por 5 minutos.

### 6. Tratamento de erros
Toasts amigáveis: \`401\` ("Chave inválida — configure CLAUDE_RESELLER_API_KEY"), \`402\` ("Saldo insuficiente — recarregue na sua conta"), \`409\` ("Pedido já processado"), \`502\` ("Provedor indisponível, tente novamente").

### 7. Webhook receiver (opcional, recomendado)
Crie a edge function pública \`claude-webhook\` que:
- Recebe POST do payload acima.
- Valida a assinatura HMAC \`x-signature\` (sha256) usando o secret \`CLAUDE_WEBHOOK_SECRET\`.
- Salva em uma nova tabela \`claude_webhook_events\` (id, event, payload jsonb, received_at). Adicione RLS adequada.

## ✅ Critérios de aceite
- Build passa sem erros e sem warnings novos.
- Todas as rotas e itens de menu **antigos continuam funcionando**.
- Posso abrir \`/integracoes/claude\`, ver saldo, emitir uma chave de teste, copiá-la no modal e ver o pedido aparecer em "Últimos pedidos".
- A \`CLAUDE_RESELLER_API_KEY\` nunca aparece no bundle do frontend.
- O design segue os tokens do projeto (sem cores hardcoded).

## 🧪 Pós-implementação
Me explique em 5 linhas como obtenho minha \`CLAUDE_RESELLER_API_KEY\` e como configurar o webhook.
`;
}

export const DeployClaudePrompt = () => {
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
              Este prompt é para você implantar a <strong>API Claude</strong> no seu próprio
              <strong> site, sistema ou loja</strong>. Cole em qualquer assistente de código
              (Lovable, ChatGPT, Claude, Cursor, Gemini, etc.) e ele gera toda a integração
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
            Crie (ou abra) sua chave de API na aba <strong>Início Rápido</strong> e copie o valor —
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
            Opcional: configure também o <strong>webhook</strong> apontando para a edge function
            que o prompt cria, para receber eventos em tempo real.
          </li>
          <li>
            Pronto — o painel do cliente terá novas páginas e itens de menu, sem alterar nada
            do que já existia.
          </li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">O que o prompt vai criar</h2>
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Edge function proxy <code className="font-mono">claude-proxy</code></li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Cliente TypeScript tipado</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página <code className="font-mono">/integracoes/claude</code></li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página de histórico de pedidos</li>
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
          Pronto para colar no Lovable, ChatGPT, Claude, Cursor, Gemini ou qualquer assistente
          de código. Ele já contém a Base URL da sua instância.
        </p>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
{prompt}
        </pre>
      </Card>
    </div>
  );
};