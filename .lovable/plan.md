# Adaptação à nova API do fornecedor Claude

Plano completo de mudanças mapeadas a partir da doc oficial (`https://claude-ss.shardweb.app/docs/api`). Organizado por prioridade — cada fase pode ser executada e testada de forma independente.

---

## FASE 0 — Já executado ✅

- Substituição de `claude-ss.ia.br` por `claude-ss.shardweb.app` em ~25 arquivos (código + edge functions)
- Confirmação do secret `CLAUDE_RESELLER_API_BASE_URL`

---

## FASE 1 — Novos planos API-only ✅

Cadastrar 3 novos planos `api_*` que não existiam antes.

- ✅ Migration em `claude_plan_prices` e `tier_claude_prices` (custos + 12 linhas por tier)
- ✅ `PLAN_CODES` / `PLAN_LABELS` atualizados em 17 arquivos (edge functions + UI)
- ✅ Type `PlanCode` estendido, `PLAN_ORDER` estendido, `API_KEY_MAP` completo

---

## FASE 2 — Bugs críticos ✅

- ✅ **2.1** Débito nas issue functions já acontece DEPOIS do provider call (verificado). Nenhum estorno necessário. Adicionadas mensagens 409 amigáveis em `claude-issue-key` (`email_already_registered`), 402 e 429. `claude-issue-trial`, `claude-storefront-issue-trial` e `manager-claude-issue-key` já tratavam.
- ✅ **2.2** `claude-cancel-key` já validava 7 dias (`REFUND_WINDOW_DAYS`). Agora retorna `account_blocked` no response quando o provedor bloqueou a conta. Dialog de cancelamento em `RevendedorMeusClientesClaude` mostra aviso vermelho para chaves `redeemed` e toast atualizado.

---

## FASE 3 — Webhooks ✅ (já estava implementado)

- ✅ `claude-provider-webhook` já existe: HMAC-SHA256, dedupe atômico, todos os 5 eventos roteados, notificações Telegram/WhatsApp, encaminhamento para webhook do revendedor.
- ✅ Tabela `claude_provider_webhook_events` já ativa.
- ⏳ **Pendente:** função `claude-webhook-register` (gerente registra URL no provedor) + UI. Só falta esse passo administrativo para o provedor começar a enviar os eventos.

---

## FASE 4 — Telemetria de clientes (`GET /api/rsl/users`) 🟡

Painel de acompanhamento em tempo real dos clientes finais.

**4.1 Nova edge function `claude-list-network-users`**
Wrapper do `GET /api/rsl/users` — só o próprio revendedor pode chamar (via JWT).

**4.2 Enriquecer `RevendedorMeusClientesClaude.tsx`**
Adicionar por cliente:
- `dailyPercentUsed` com barra de progresso
- `weeklyTokensInWindow` / `weeklyTokenLimit`
- `accountExpiresAt` (badge de dias restantes)
- `status` (active/expired/suspended)

**4.3 Dashboard gerente**
Card com totais consolidados: quantos clientes ativos/expirados por revendedor, top consumidores.

---

## FASE 5 — Endpoint de renovação (`POST /api/rsl/renew`) 🟡

Hoje, renovar = emitir chave nova (novo `code`, novo registro, cliente precisa resgatar de novo). Novo fluxo: renovação in-place.

**5.1 Nova edge function `claude-renew-key`**
- Recebe `order_id` local, resolve `email` do cliente, chama `POST /api/rsl/renew`
- Debita saldo com a mesma lógica de `claude-issue-key` (custo por tier + promoção)
- Cria novo registro em `claude_orders` marcado como `kind='renewal'` + FK pro pedido original
- Não gera novo `code` (a resposta não traz `code`)

**5.2 UI: botão "Renovar" em `RevendedorMeusClientesClaude`**
- Seletor de plano (mesmo ou upgrade)
- Confirmação com preço e nova `accountExpiresAt`

---

## FASE 6 — Contas de teste do provedor (`POST /api/rsl/test`) 🟢

Trial gratuito (15min/50msgs, 20/dia, sem débito).

**6.1 Nova edge function `claude-issue-provider-trial`**
Diferente do trial atual (que consome chave real): este é gratuito no provedor, ideal para prospecção.

**6.2 UI**
Botão "Emitir conta de teste grátis (15min)" com validação de limite diário.

---

## FASE 7 — Robustez e observabilidade 🟢

**7.1 Sync de preços via `/api/rsl/me`**
Cron/edge function que:
- Chama `/api/rsl/me` diariamente
- Compara `prices[kind]` com `claude_plan_prices.cost_cents`
- Notifica gerente no Telegram se houver divergência (o provedor pode ter alterado seu custo sem avisar)

**7.2 Auditoria de UI**
- Modo "com email (recomendado)" vs "só código de resgate" mais explícito na tela de emissão manual, seguindo a orientação da doc

**7.3 Rate limit awareness**
Adicionar retry com backoff em chamadas ao `/me` e evitar polling desnecessário.

---

## Fora de escopo (por enquanto)

- Plano `api_30d` (R$ 120) — não pediu para ativar
- Reativar `5x_7d` — segue inativo
- Substituir tabela local de preços por leitura online do `/me` — mantemos local por performance, com sync como fallback

---

## Ordem de execução recomendada

```text
FASE 1  →  FASE 2  →  FASE 3  →  FASE 4  →  FASE 5  →  FASE 6  →  FASE 7
   1d       0.5d      1.5d       1d         1d         0.5d       0.5d
(baixa)   (crítica) (média)    (média)   (média)    (baixa)   (baixa)
```

Cada fase é independente e pode ser deployada isolada. Se algo quebrar, dá pra fazer rollback só daquela fase sem afetar o resto.

## Detalhes técnicos (para referência do dev)

- Todas as edge functions usam `Authorization: Bearer ${CLAUDE_RESELLER_API_KEY}` no upstream
- `BASE_URL` vem do secret `CLAUDE_RESELLER_API_BASE_URL` (agora `https://claude-ss.shardweb.app`)
- Débito de saldo continua atômico via RPC `debit_reseller_balance`
- Reembolso deve usar `credit_reseller_balance` (verificar se existe; se não, criar)
- Custo por tier resolvido via RPC `get_reseller_claude_cost` (já existe)
- Promoção "Inauguração Claude" aplicada em `claude_discount_by_tier` (JSON) e resolvida em runtime
