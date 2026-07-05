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

## 🆕 Versão 2 — atualização de julho/2026
Se você já implementou a versão anterior desta API, **estas são as novidades — adicione-as sem quebrar o que já funciona**:
- **\`email\` agora é OBRIGATÓRIO** em \`POST /chaves\` (sem ele → \`400 email_obrigatorio\`). A resposta pode incluir \`api_key\`, \`user_id\` e \`provider_base_url\` — quando vierem, mostre-os no modal de sucesso (o cliente já pluga direto no Cursor/Cline sem passar pelo Portal).
- **Saldo insuficiente vira 202 \`awaiting_balance\`** em vez de erro definitivo: o pedido fica em espera e a chave é entregue via webhook \`claude.key.issued\` assim que você recarregar. Não reenvie \`POST /chaves\`.
- **Novo endpoint \`POST /chaves/{id}/renovar\`:** renova o plano do cliente pelo mesmo e-mail, sem gerar nova chave. Debita saldo.
- **Novo endpoint \`POST /teste\` (opcional):** emite uma conta de TESTE GRATUITA que expira em **15 MINUTOS *ou* 50 MENSAGENS** (o que vier primeiro). NÃO debita saldo. Retorna \`api_key\` (kp_user_…) pronta para uso. Limite do provedor: 20 testes/dia por conta de revenda (429 \`provider_daily_limit_reached\` quando estoura — fale com o admin para liberar mais). **O revendedor decide se quer oferecer** — se sim, exponha um botão "Testar grátis (15 min ou 50 msgs)" e sempre deixe explícito o limite duplo na UI.
- **\`GET /chaves/{id}\` enriquecido:** agora devolve \`customer_email/name/whatsapp\`, \`redeemed_at\`, \`expired_at\`, \`cancelled_at\`, \`tokens_exhausted_at\`, \`is_renewal\`.
- **Webhook \`claude.key.renewed\`** foi adicionado e novos eventos (\`claude.key.expired\`, \`claude.tokens.limit_reached\` etc.) chegarão em breve — todos assinados com HMAC-SHA256 no header \`X-Signature\`. **Responda 2xx a qualquer \`event\` desconhecido** para não quebrar a integração no futuro.

## ⚠️ Regra de ouro — fonte única da verdade
**Toda a lógica de saldo, planos, preços, emissão de chave Claude e histórico DEVE vir da API do fornecedor descrita abaixo.** É proibido:
- Inventar planos, preços ou limites locais (sempre buscar via \`GET /planos\`).
- Recriar a engine de emissão/débito no banco da loja.
- Hardcodar valores (preço, saldo, expiração) — sempre buscar via API no momento do uso.
- Criar tabelas que dupliquem dados do fornecedor; se persistir algo, salve **apenas referências** (\`order_id\`, \`chave\`) e refaça \`GET /chaves\` para a fonte autoritativa.

Em resumo: o painel do cliente é uma **UI + proxy seguro**. Toda decisão de negócio é delegada à API do fornecedor.

## 🧭 Antes de começar — escolha o MODO de integração

Pergunte ao dono do projeto (ou detecte pelo código) em qual cenário você está e siga **apenas** o modo correspondente. Não misture os dois.

- **MODO A — Instalação nova (from scratch):** o projeto ainda **não** tem área/portal de cliente para Claude. Nesse caso siga o roteiro completo abaixo: crie edge function, cliente TS, **páginas novas** (\`/integracoes/claude\` e histórico) e adicione item no menu **Integrações**.
- **MODO B — Adaptação (o revendedor JÁ tem portal/loja/área de cliente próprio):** **NÃO** crie páginas novas, **NÃO** adicione itens de menu, **NÃO** invente rotas. Entregue apenas:
  1. A edge function proxy \`claude-proxy\` (item 1).
  2. O cliente TypeScript tipado em \`src/integrations/claude/client.ts\` (item 2).
  3. **Componentes plugáveis** que o dev do revendedor encaixa nas páginas que já existem:
     - \`<ClaudeSaldoCard/>\` — mostra saldo (usa \`getSaldo()\`).
     - \`<EmitirChaveClaudeForm/>\` — formulário de emissão + modal com a chave (usa \`getPlanos()\` + \`emitirChave()\`).
     - \`<HistoricoPedidosClaude/>\` — tabela dos últimos pedidos (usa \`listarPedidos()\`).
     - \`<ConsumoTokensCard customerEmail=... />\` — opcional, exibe consumo do cliente final quando o portal já tiver identidade do cliente.
  4. O receiver de webhook (item 7) — **sem** criar UI.
  Pergunte ao dev onde ele quer plugar cada componente; **não** decida por ele. Se ele já tiver algo equivalente (ex.: card de saldo, tabela de pedidos), diga como consumir só o cliente TS em vez de importar os componentes.

> Regras que valem para **ambos** os modos: nada de remover/renomear rotas, menus, tabelas, funções ou componentes existentes; a \`CLAUDE_RESELLER_API_KEY\` nunca vai pro frontend; todo valor/estado vem da API do fornecedor.

## 🎯 Objetivo
Integrar a API Claude do meu provedor para que meu painel possa:
1. Consultar meu saldo.
2. Listar planos ativos e preços efetivos.
3. Emitir chaves Claude (debitando do meu saldo).
4. Visualizar histórico de pedidos.
5. Receber webhooks quando uma chave for emitida (opcional).

## 🔑 Credenciais
- **Base URL (backend do revendedor → nossa API de revenda):** \`${baseUrl}\`
  Use **somente no seu backend** (edge function \`claude-proxy\`) para consultar saldo, planos, emitir e listar chaves. **NÃO** exiba esta URL para o cliente final.
- **Base URL do FORNECEDOR (para o cliente final plugar no Cursor / Claude Code / Cline):** \`https://claude-ss.ia.br/\`
  Essa é a URL que aparece no painel do cliente ao lado da chave \`ACT-...\`. O cliente configura o cliente Anthropic com essa base URL + a chave recebida. **Nunca** mostre a URL do \`reseller-claude-api\` para o cliente — ele não deve chamá-la diretamente.
- **Autenticação (backend → API de revenda):** header \`x-api-key: <MINHA_CHAVE>\` em **todas** as requisições ao \`${baseUrl}\`.
- A chave deve ser armazenada como **segredo do backend** (nunca exposta no frontend). Crie **dois** secrets e peça ao usuário para preenchê-los:
  - \`CLAUDE_RESELLER_API_KEY\` — a API Key gerada em **Painel → API Claude → Gerar chave API** (começa com \`sk_claude_\`).
  - \`CLAUDE_WEBHOOK_SECRET\` — o **Segredo HMAC** exibido em **Painel → API Claude → Webhook** (usado para validar \`x-signature\` dos eventos).

## 📚 Endpoints disponíveis

> ℹ️ **Header obrigatório em toda requisição:** \`X-API-Key: <MINHA_CHAVE>\`.
> Para emissão/renovação, envie também \`Idempotency-Key: <uuid>\` — não use \`request_id\` no body (o servidor prioriza o header).
> Todas as respostas seguem o padrão \`{ success: true, ... }\` ou \`{ success: false, error: "codigo" }\`.

### GET /status
Verifica se a integração está viva e se o produto Claude está liberado para você.
\`\`\`json
{ "success": true, "claude_enabled": true }
\`\`\`

### GET /saldo
Retorna o saldo da carteira (em centavos BRL).
\`\`\`json
{ "success": true, "saldo_centavos": 125000, "saldo": "1250.00" }
\`\`\`

### GET /planos
Lista de planos ativos com **seu** preço efetivo (já com markup do nível/overrides).
\`\`\`json
{ "success": true, "planos": [
  { "plano": "pro_30d",  "preco_centavos": 8000,  "preco": "80.00",  "disponivel": true },
  { "plano": "5x_7d",    "preco_centavos": 5900,  "preco": "59.00",  "disponivel": true },
  { "plano": "5x_30d",   "preco_centavos": 14900, "preco": "149.00", "disponivel": true },
  { "plano": "20x_30d",  "preco_centavos": 24900, "preco": "249.00", "disponivel": true }
] }
\`\`\`
> Códigos oficiais de \`plano\`: \`pro_30d\`, \`5x_7d\`, \`5x_30d\`, \`20x_30d\`. Nunca hardcode preços — leia daqui a cada emissão.

### POST /chaves
Emite uma chave Claude e debita do saldo.
**Header:** \`Idempotency-Key: <uuid-v4>\` (evita cobrança duplicada em retries).
**Body:**
\`\`\`json
{ "plano": "5x_30d",
  "id_cliente": "cliente@dominio.com",
  "nome": "Cliente João",
  "email": "cliente@dominio.com",
  "whatsapp": "5511999999999" }
\`\`\`
> ⚠️ **\`email\` é OBRIGATÓRIO** (validado no servidor — sem ele a API responde \`400 email_obrigatorio\`). É por meio do e-mail que o fornecedor entrega a chave e vincula o consumo de tokens. **Envie também \`nome\` e \`whatsapp\`** — opcionais, mas recomendados para atender o cliente no painel "Meus Clientes Claude".
**Resposta 200 (chave emitida):**
\`\`\`json
{ "success": true,
  "pedido_id": "uuid",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "CLAUDE-XXXXX-XXXXX",
  "provider_key_id": "prov_abc123",
  "api_key": "kp_user_...",
  "user_id": "u_...",
  "provider_base_url": "https://claude-ss.ia.br/" }
\`\`\`
> ⚠️ O \`codigo\` (e o \`api_key\` de entrega direta) só voltam nesta resposta e no webhook \`claude.key.issued\` — armazene com segurança e exiba **uma única vez** para o cliente.
> Quando \`api_key\` vier preenchido, o cliente já pode plugar direto no Cursor/Cline/Claude Code com \`provider_base_url\`. Senão, ele resgata o \`codigo\` no portal.

**Resposta 202 (saldo insuficiente — pedido em espera):**
\`\`\`json
{ "success": false, "error": "saldo_insuficiente", "status": "awaiting_balance",
  "pedido_id": "uuid", "saldo_centavos": 5000, "preco_centavos": 14900 }
\`\`\`
> Trate como "aguardando confirmação". Quando o revendedor recarregar o painel, o fornecedor emite a chave automaticamente e dispara o webhook \`claude.key.issued\`. **Não** reenvie \`POST /chaves\` — geraria pedido duplicado.

**Erros:** \`400 email_obrigatorio\` · \`400 invalid_plano\` / \`plano_indisponivel\` · \`401\` chave inválida · \`402 saldo_insuficiente\` · \`403\` revendedor inativo / Claude não habilitado · \`502 provider_error\` / \`provider_network_error\`.

### GET /chaves
Últimos 50 pedidos do revendedor. **Não** devolve o \`codigo\`/\`api_key\` (por segurança).
\`\`\`json
{ "success": true, "chaves": [
  { "id": "uuid", "plan_code": "5x_30d", "status": "issued",
    "sale_price_cents": 14900, "provider_key_id": "prov_...",
    "created_at": "2026-07-04T12:00:00Z", "error_message": null }
] }
\`\`\`

### GET /chaves/{id}
Detalhe completo de um pedido. Use para consultar o status atual sem baixar a lista inteira.

**Resposta 200:**
\`\`\`json
{ "success": true, "chave": {
  "id": "uuid",
  "plan_code": "5x_30d",
  "status": "issued",
  "code": "CLAUDE-XXXXX-XXXXX",
  "sale_price_cents": 14900,
  "provider_key_id": "prv_...",
  "customer_email": "cliente@dominio.com",
  "customer_name": "Nome do Cliente",
  "customer_whatsapp": "5511999999999",
  "created_at": "2026-07-04T12:00:00Z",
  "redeemed_at": null,
  "expired_at": null,
  "cancelled_at": null,
  "tokens_exhausted_at": null,
  "is_renewal": false,
  "error_message": null
} }
\`\`\`
> \`status\` possíveis: \`pending\` · \`awaiting_balance\` · \`issued\` (aguardando resgate) · \`redeemed\` (cliente ativou) · \`expired\` · \`cancelled\` · \`cancel_failed\` · \`refunded\` · \`failed\`.
**Erros:** \`404\` pedido não encontrado.

### GET /chaves/{id}/consumo
Snapshot de consumo de tokens do cliente (best-effort — depende do fornecedor).
\`\`\`json
{ "success": true, "consumo": {
  "status": "active",
  "expira_em": "2026-08-01T...",
  "tokens_consumidos": 12345,
  "tokens_janela": 8000,
  "tokens_limite": 500000,
  "janela_horas": 5,
  "percentual_usado_dia": 1.6,
  "percentual_restante": 98.4,
  "tokens_janela_semanal": 20000,
  "tokens_limite_semanal": 2500000
} }
\`\`\`
> Use no card **"Consumo de tokens"** do painel do cliente. Se \`consumo\` vier \`null\`, mostre "O fornecedor ainda não retornou dados de consumo para esta chave." e ofereça um botão de atualizar — o consumo aparece após o primeiro uso real. A resposta também traz \`provider_error\` quando o fornecedor não pôde ser consultado.

### POST /chaves/{id}/cancelar
Cancela uma chave e devolve o valor ao saldo do revendedor **se estiver dentro da janela de 7 dias** desde a emissão. Passado esse prazo, envie \`{ "force": true }\` para cancelar sem estorno.

**Body (opcional):**
\`\`\`json
{ "force": false }
\`\`\`
**Resposta 200:**
\`\`\`json
{ "success": true, "pedido_id": "uuid", "refund_cents": 14900, "refund_waived": false, "age_days": 2 }
\`\`\`
**Erros:** \`404\` pedido não encontrado · \`409 invalid_status\` · \`409 refund_window_expired\` (fora do prazo — reenvie com \`force: true\`) · \`422 missing_provider_key_id\` · \`502 provider_error\`.

> ⚠️ Cancelar bloqueia a conta do cliente final no fornecedor. Confirme com o cliente antes.

### POST /chaves/{id}/renovar
Renova o plano de um cliente existente pelo mesmo e-mail — **não gera nova chave**, apenas estende a validade/tokens no fornecedor. Debita o custo padrão do plano do saldo do revendedor.

**Header:** \`Idempotency-Key: <uuid-v4>\` (recomendado).
**Body (opcional):**
\`\`\`json
{ "email": "cliente@dominio.com" }
\`\`\`
> Se \`email\` for omitido, usa o e-mail salvo no pedido original.

**Resposta 200:**
\`\`\`json
{ "success": true, "pedido_id": "uuid", "pedido_original_id": "uuid",
  "plano": "5x_30d", "preco_centavos": 14900, "email": "cliente@dominio.com" }
\`\`\`
**Erros:** \`400 email_required\` (pedido sem e-mail e nenhum enviado) · \`400 email_obrigatorio\` (formato inválido) · \`402 saldo_insuficiente\` · \`404\` pedido não encontrado · \`502 provider_error\`.

### POST /teste
Emite uma chave de teste de **15 minutos** sem custo. Máximo 5 chamadas por hora por API Key.

> ⚠️ **Recurso opcional.** Só implemente a UI de "Testar grátis" se o revendedor confirmar que quer oferecer aos clientes. Caso contrário, deixe apenas a função no cliente TS (útil para testes internos) e não exponha botão público.

**Body (opcional):**
\`\`\`json
{ "email": "lead@dominio.com" }
\`\`\`
**Resposta 200:**
\`\`\`json
{ "success": true, "codigo": "CLAUDE-XXXXX-XXXXX", "api_key": "kp_user_...",
  "user_id": "u_...", "provider_base_url": "https://claude-ss.ia.br/", "duracao_minutos": 15 }
\`\`\`
**Erros:** \`429\` \`rate_limited\`.

### Webhook (POST do servidor para a URL configurada)
Disparado sempre que um evento acontece. Header de assinatura: \`X-Signature: sha256=<hex>\` (HMAC-SHA256 do corpo cru, usando \`CLAUDE_WEBHOOK_SECRET\`). O corpo sempre inclui \`event\` e \`sent_at\`.

**Payload \`claude.key.issued\`:**
\`\`\`json
{ "event": "claude.key.issued",
  "pedido_id": "uuid",
  "plano": "5x_30d",
  "preco_centavos": 14900,
  "codigo": "CLAUDE-XXXXX-XXXXX",
  "provider_key_id": "prov_abc123",
  "id_cliente": "cliente@dominio.com",
  "sent_at": "2026-07-01T12:34:56Z" }
\`\`\`
**Payload \`claude.key.renewed\`:**
\`\`\`json
{ "event": "claude.key.renewed",
  "pedido_id": "uuid-renov", "pedido_original_id": "uuid",
  "plano": "5x_30d", "preco_centavos": 14900,
  "email": "cliente@dominio.com", "sent_at": "..." }
\`\`\`
> **Regra event-agnóstica:** responda 2xx a qualquer \`event\` desconhecido (apenas registre/ignore). Novos eventos (\`claude.key.expired\`, \`claude.tokens.limit_reached\` etc.) entrarão sem quebrar sua integração. Só rejeite com 401 quando a assinatura HMAC não bater.

## 🧱 O que adicionar no projeto (sem remover nada do que já existe)

### 1. Backend (edge function)
Crie a edge function **\`claude-proxy\`** que:
- Aceita e proxeia: \`GET /status\`, \`GET /saldo\`, \`GET /planos\`, \`POST /chaves\`, \`GET /chaves\`, \`GET /chaves/{id}\`, \`GET /chaves/{id}/consumo\`, \`POST /chaves/{id}/cancelar\`, \`POST /chaves/{id}/renovar\`, \`POST /teste\`.
- Lê o segredo \`CLAUDE_RESELLER_API_KEY\` e injeta no header \`X-API-Key\` ao chamar \`${baseUrl}\`.
- Repassa o header \`Idempotency-Key\` do cliente quando presente (nunca deixe o frontend chamar direto — a chave nunca pode ir pro bundle).
- Retorna o JSON cru do upstream + \`status\` HTTP correspondente.
- CORS liberado para o domínio do app.

### 2. Cliente TypeScript
Crie \`src/integrations/claude/client.ts\` com funções tipadas: \`getStatus()\`, \`getSaldo()\`, \`getPlanos()\`, \`emitirChave(input)\`, \`listarPedidos(limit?)\`, \`getPedido(id)\`, \`getConsumo(id)\`, \`cancelarChave(id, force?)\`, \`renovarChave(id, email?)\`, \`emitirTeste(email?)\`. Todas chamando a edge function \`claude-proxy\` e gerando \`Idempotency-Key\` (UUID v4) nas rotas de emissão/renovação.

### 3. Páginas novas (NÃO substituir páginas existentes)
> Apenas no **MODO A**. No **MODO B**, pule esta seção inteira e entregue os componentes plugáveis descritos no topo.
- **\`/integracoes/claude\`** — Card com saldo. Grid dos planos ativos (buscados de \`/planos\`). Formulário "Emitir chave" (plano + dados do cliente + botão). Modal exibindo a \`chave\` uma única vez, com botão de copiar. Tabela com últimos 20 pedidos.
- **\`/integracoes/claude/historico\`** — Histórico paginado completo.

> **No painel/portal do cliente final**, sempre exiba **dois blocos** na seção da chave:
> 1. **CHAVE (X-API-KEY)** — o valor \`ACT-...\` retornado no \`POST /chaves\`.
> 2. **URL BASE DO FORNECEDOR** — o valor fixo \`https://claude-ss.ia.br/\` (nunca a URL do \`reseller-claude-api\`). Esta é a URL que ele configura no Cursor/Cline/Claude Code.
>
> Também exiba o card **"Consumo de tokens"** usando \`GET /chaves/{id}/consumo\`.

### 4. Sidebar / Menu
> Apenas no **MODO A**. No **MODO B**, **não** adicione item de menu — o revendedor já tem o próprio.
Adicione um novo item ao grupo **"Integrações"** (crie o grupo se não existir):
- 🤖 **Claude (Revenda)** → \`/integracoes/claude\`

⚠️ **Não remover nem renomear** nenhum item de menu já existente.

### 5. Idempotência
Sempre gere um \`request_id\` UUID v4 do lado do backend antes de chamar \`POST /chaves\`. Se o usuário reenviar o formulário, reutilize o mesmo \`request_id\` por 5 minutos.

### 6. Tratamento de erros
Toasts amigáveis: \`401\` ("Chave inválida — configure CLAUDE_RESELLER_API_KEY"), \`402\` ("Saldo insuficiente — recarregue na sua conta"), \`409\` ("Pedido já processado"), \`502\` ("Provedor indisponível, tente novamente").

### 6.1 Regra de saldo (importante)
O pagamento de cada emissão é **debitado do saldo do painel do revendedor** no provedor.
- Se o saldo estiver menor que o custo da venda, o provedor cria o pedido com status
  \`awaiting_balance\` e **não entrega a chave imediatamente**.
- A chave é gerada e entregue automaticamente **assim que o revendedor recarregar
  o painel** com valor igual ou maior ao custo da venda.
- Trate no seu sistema: quando o \`POST /chaves\` retornar \`status: "awaiting_balance"\`,
  informe o cliente final ("aguardando confirmação — sua chave será entregue
  automaticamente em instantes") e escute o webhook \`claude.key.issued\` para
  entregar a chave depois. Não tente reemitir manualmente.

### 7. Webhook receiver (opcional, recomendado)
Crie a edge function pública \`claude-webhook\` que:
- Recebe POST do payload acima.
- Valida a assinatura HMAC \`x-signature\` (sha256) usando exatamente o secret \`CLAUDE_WEBHOOK_SECRET\`.
- Aceita o header em caixa alta/baixa e assinatura no formato \`sha256=<hex>\`.
- Para evitar falso negativo por encoding, calcule o HMAC sobre o corpo cru da requisição, antes de fazer \`JSON.parse\`.
- Salva em uma nova tabela \`claude_webhook_events\` (id, event, payload jsonb, received_at). Adicione RLS adequada.

**IMPORTANTE — desabilite verificação de JWT** no \`supabase/config.toml\` do seu projeto, senão o webhook retorna 401 e nada é entregue:

\`\`\`toml
[functions.claude-webhook]
verify_jwt = false
\`\`\`

O endpoint precisa aceitar chamadas **sem Authorization** (é público, assinado por HMAC).

**Teste do painel + eventos desconhecidos:** o botão "Enviar evento de teste" do meu painel envia um payload fixo \`{"event":"webhook.test", ...}\` assinado com o mesmo \`CLAUDE_WEBHOOK_SECRET\`. Sua função **deve responder 2xx para qualquer \`event\` desconhecido** (apenas registre/ignore), em vez de devolver 4xx. Só rejeite com 401 quando a assinatura HMAC não bater. Assim novos tipos de evento no futuro não quebram a integração.

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