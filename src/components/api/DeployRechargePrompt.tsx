import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/reseller-recharge-api`;

function buildPrompt(baseUrl: string) {
  return `# 🚀 Implantar API de Plano 3K (assinatura de recarga) na minha loja/site

Você é um engenheiro sênior. Implemente a integração abaixo no projeto do cliente **sem remover, renomear ou quebrar nenhuma rota, página, tabela, função ou componente existente**. Apenas **adicione** o que for necessário. Mantenha o estilo visual atual (design tokens, sidebar, layout).

## 🧰 Stack alvo
Este prompt assume um projeto padrão **React + Vite + TypeScript + Tailwind + shadcn/ui** no frontend e **Edge Functions (Deno/Supabase)** no backend. Se o projeto usar outra stack (Next.js, Nuxt, Laravel, Node/Express, etc.), **adapte os caminhos e o runtime do proxy** mantendo a mesma arquitetura (frontend → proxy backend com a chave em segredo → API do provedor).

## ⚠️ Regra de ouro — fonte única da verdade
**Toda a lógica de planos, preços, status, cliente, datas e entregas DEVE ser obtida da API do fornecedor descrita abaixo.** É proibido:
- Inventar planos, preços ou regras de negócio locais.
- Recriar a engine de entrega diária, cálculo de cap, geração de token ou status no banco da loja.
- Usar valores hardcoded (preço, duração, créditos/dia) — sempre buscar via \`GET /planos/catalogo\`.
- Criar tabelas que duplicam dados que já existem no fornecedor; se precisar persistir algo, salve **apenas referências** (\`assinaturaId\`, \`token\`, \`status\` em cache) e refaça \`GET /planos/:token\` para a fonte autoritativa.

Em resumo: a loja é uma **vitrine + checkout**. Toda decisão de negócio é delegada à API do fornecedor.

## 🎯 Objetivo
Integrar a API de planos de recarga (Plano 3K) do provedor para que a loja/site do cliente possa:
1. Listar os planos disponíveis com preço de venda configurado.
2. Vender o Plano 3K para os clientes finais (debitando do saldo do revendedor).
3. Gerar um link de checkout único que o cliente final abre para confirmar os dados e iniciar a entrega diária de recargas.
4. Listar e acompanhar as assinaturas vendidas.
5. Receber webhooks quando uma venda for concluída, cancelada ou quando cada entrega diária for finalizada (opcional).

## 🔑 Credenciais
- **Base URL:** \`${baseUrl}\`
- **Autenticação:** header \`X-API-Key: <MINHA_CHAVE>\` em **todas** as requisições.
- A chave deve ser armazenada como **segredo do backend** (nunca exposta no frontend). Crie o secret \`LOVMAIN_RECHARGE_API_KEY\` e peça ao usuário para preenchê-lo.
- **Importante:** antes de vender, o revendedor deve configurar o preço de venda em \`/painel/revendedor/plano-precos\`.

## 📚 Endpoints disponíveis

### GET /planos/catalogo
Retorna os planos ativos com o preço de venda configurado pelo revendedor.
**Resposta:**
\`\`\`json
{
  "success": true,
  "data": {
    "planos": [
      {
        "planoId": "uuid-do-plano",
        "nome": "Plano 3K Créditos",
        "descricao": "...",
        "duracaoDias": 30,
        "creditosPorDia": 100,
        "capTotal": 3000,
        "horarioEntregaBRT": 9,
        "custoCentavos": 12000,
        "precoVendaCentavos": 19900,
        "disponivel": true
      }
    ]
  }
}
\`\`\`
\`disponivel = true\` somente quando o revendedor definiu \`sale_price_cents > 0\` e ativou o plano.

### POST /planos
Cria uma assinatura/venda, debita o custo do saldo do revendedor e devolve o link de checkout para o cliente final.
**Body:**
\`\`\`json
{
  "planoId": "uuid-do-plano",
  "cliente": {
    "nome": "João da Silva",
    "whatsapp": "+5511999998888"
  },
  "notas": "Venda realizada via site da loja"
}
\`\`\`
**Header opcional:** \`x-app-origin: https://sualoja.com.br\` (usado para montar o \`linkCliente\`).
**Resposta:**
\`\`\`json
{
  "success": true,
  "data": {
    "assinaturaId": "uuid-da-assinatura",
    "token": "token-de-32-chars",
    "status": "awaiting_owner",
    "linkCliente": "https://sualoja.com.br/plano/TOKEN",
    "custoCentavos": 12000,
    "precoVendaCentavos": 19900,
    "novoSaldoCentavos": 50000,
    "novoSaldoReais": "500.00"
  }
}
\`\`\`
**Erros:** \`401\` chave inválida · \`400\` saldo insuficiente · \`400\` preço de venda não configurado · \`404\` plano não encontrado.

### GET /planos
Lista as assinaturas do revendedor (paginado).
**Query:** \`?limit=50&offset=0&status=active\`

### GET /planos/{token}
Detalhes da assinatura + cronograma de entregas diárias.

### POST /planos/{token}/cancelar
Cancela a assinatura antes do cliente confirmar o início. O custo é estornado integralmente.

### Webhooks (POST do servidor para a URL configurada na chave)
Disparados automaticamente quando a chave tem \`webhook_url\` configurado.
**Eventos padrão:** \`plan.sold\`, \`plan.completed\`, \`plan.cancelled\`.
**Opt-in:** \`plan.delivery.completed\` (cada entrega diária concluída).
**Payload exemplo (plan.sold):**
\`\`\`json
{
  "event": "plan.sold",
  "subscription_id": "uuid",
  "reseller_id": "uuid",
  "occurred_at": "2026-06-13T12:00:00Z",
  "plan_id": "uuid",
  "plan_name": "Plano 3K Créditos",
  "customer": { "name": "João", "whatsapp": "+5511..." },
  "duration_days": 30,
  "credits_per_day": 100,
  "total_credits": 3000,
  "cost_cents": 12000,
  "sale_price_cents": 19900,
  "order_token": "token-32-chars"
}
\`\`\`

## 🧱 O que adicionar no projeto (sem remover nada do que já existe)

### 1. Backend (edge function ou servidor)
Crie uma edge function **\`lovmain-recharge-proxy\`** (em projetos com Supabase: \`supabase/functions/lovmain-recharge-proxy/index.ts\`) que:
- Aceite \`GET /planos/catalogo\`, \`POST /planos\`, \`GET /planos\`, \`GET /planos/:token\` e \`POST /planos/:token/cancelar\`.
- Leia a chave com \`Deno.env.get("LOVMAIN_RECHARGE_API_KEY")\` e injete no header \`X-API-Key\` ao chamar \`${baseUrl}\`.
- Encaminhe o \`x-app-origin\` recebido (ou use \`req.headers.get("origin")\`) para o upstream.
- Retorne o JSON do upstream com o mesmo \`status\` HTTP.
- Implemente **CORS** com \`Access-Control-Allow-Origin: *\` e responda \`OPTIONS\`.
- **Nunca exponha a chave no frontend.** Cadastre o segredo \`LOVMAIN_RECHARGE_API_KEY\` no painel de secrets do backend.

Em outras stacks, crie a rota equivalente (ex.: \`/api/plano-3k/*\`) seguindo a mesma lógica.

### 2. Cliente TypeScript tipado
Crie \`src/integrations/lovmain-recharge/client.ts\` com funções: \`getCatalogo()\`, \`criarVenda(input)\`, \`listarAssinaturas(params)\`, \`getAssinatura(token)\`, \`cancelarAssinatura(token)\`. Todas chamando a edge function \`lovmain-recharge-proxy\` via \`supabase.functions.invoke\` (ou \`fetch\` para a URL da function). Nunca chame o upstream direto.

### 3. Página/Componente "Plano 3K" na loja
- Crie a página (ex.: \`src/pages/Plano3K.tsx\`) e registre a rota no roteador do projeto **sem remover rotas existentes**.
- Consulte \`getCatalogo()\` e exiba o plano disponível (nome, duração, créditos/dia, cap total, preço de venda).
- Botão "Comprar" que leva o cliente final ao checkout do site (Pix, cartão, etc.) — **isso é responsabilidade da loja do revendedor**.
- Após confirmar o pagamento na loja, o backend chama \`criarVenda()\` e recebe o \`linkCliente\`.
- Redirecione o cliente final para o \`linkCliente\` (ou exiba como QR code / botão "Configurar minha entrega").
- Use **tokens de design do projeto** (sem cores hardcoded — \`bg-primary\`, \`text-foreground\`, etc.).

### 4. Página/Componente "Minhas Assinaturas" (opcional)
- Liste as vendas do Plano 3K com \`listarAssinaturas()\`.
- Exiba status, cliente, datas, token e botão "Cancelar" (quando status = awaiting_owner / awaiting_confirm).

### 5. Sidebar / Menu
Adicione um **novo item de menu** (ou um novo grupo "Integrações") apontando para a página criada. ⚠️ **Não remover nem renomear** itens já existentes.

### 6. Webhook receiver (opcional, recomendado)
Crie a edge function pública \`lovmain-recharge-webhook\` (ou rota \`/webhooks/plano-3k\`) que:
- Recebe POST do payload acima.
- Valide a assinatura HMAC \`X-Webhook-Signature\` usando o secret configurado no painel.
- Atualize o status da assinatura no banco da loja (ex: marcando como "ativa", "concluída" ou "cancelada"). Em Supabase, crie a tabela com **RLS habilitada** e \`GRANT\`s adequados.

## ✅ Critérios de aceite
- Build passa sem erros e sem warnings novos.
- Todas as rotas e itens de menu **antigos continuam funcionando**.
- O cliente final pode ver o Plano 3K na loja, comprar, e receber o \`linkCliente\` para configurar a entrega.
- A chave \`LOVMAIN_RECHARGE_API_KEY\` nunca aparece no bundle do frontend.
- O design segue os tokens do projeto (sem cores hardcoded).
- A edge function tem CORS configurado e responde \`OPTIONS\`.

## 🧪 Pós-implementação
Me explique em 5 linhas como o revendedor obtém a \`LOVMAIN_RECHARGE_API_KEY\` no painel e como configurar o webhook.
`;
}

export const DeployRechargePrompt = () => {
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
            Opcional: configure também o <strong>webhook</strong> apontando para o endpoint que
            o prompt cria, para receber eventos em tempo real.
          </li>
          <li>
            Pronto — a loja do cliente terá o Plano 3K integrado, sem alterar nada do
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
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Proxy/backend seguro para a API</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página do Plano 3K na loja</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Fluxo de venda + link de checkout</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Listagem de assinaturas vendidas</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Cancelamento antes da confirmação</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Receiver de webhook (opcional)</li>
        </ul>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Prompt de implantação — Plano 3K</h2>
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
