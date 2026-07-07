# Adaptação à nova API do fornecedor Claude

Plano completo de mudanças mapeadas a partir da doc oficial (`https://claude-ss.shardweb.app/docs/api`). Organizado por prioridade — cada fase pode ser executada e testada de forma independente.

---

## FASE 0 — Já executado ✅

- Substituição de `claude-ss.ia.br` por `claude-ss.shardweb.app` em ~25 arquivos (código + edge functions)
- Confirmação do secret `CLAUDE_RESELLER_API_BASE_URL`

---

## FASE 1 — Novos planos API-only (rápido, sem risco)

Cadastrar 3 novos planos `api_*` que não existiam antes.

**1.1 Migration em `claude_plan_prices`**
Inserir custo do fornecedor:
- `api_500k_30d` → R$ 20,00
- `api_25m_30d` → R$ 70,90
- `api_10m_30d` → R$ 109,00

**1.2 Migration em `tier_claude_prices`**
Inserir 12 linhas (3 planos × 4 níveis) espelhando os valores dos planos equivalentes (pro/5x/20x). A promoção "Inauguração Claude" pega automaticamente.

**1.3 Atualizar constantes nas edge functions**
Adicionar os 3 novos códigos em `PLAN_CODES` e `PLAN_LABELS`:
- `claude-issue-key/index.ts`
- `manager-claude-issue-key/index.ts`
- `claude-storefront-issue-trial/index.ts` (se aplicável)
- `reseller-claude-api/index.ts`

**1.4 Atualizar catálogos e UI**
- `RevendedorClaude.tsx` (opções do select)
- `ClaudePriceTable.tsx`
- `useSalesCatalog.ts`

---

## FASE 2 — Bugs críticos (dinheiro em risco) 🔴

**2.1 Tratar 409 na emissão com email → estornar saldo local**
Quando o cliente já tem conta, o provedor retorna 409 e **estorna no lado dele**, mas nosso código já debitou o saldo do revendedor. Corrigir em:
- `claude-issue-key/index.ts`
- `claude-issue-trial/index.ts`
- `manager-claude-issue-key/index.ts`
- `claude-storefront-issue-trial/index.ts`

Detectar `providerStatus === 409` → chamar RPC `credit_reseller_balance` para reverter o débito → registrar `error_message: 'email_already_exists'`.

**2.2 Cancelamento — bloqueio de conta + validação de 7 dias**
- `CancelSaleDialog.tsx`: aviso vermelho — *"Atenção: se a chave já foi RESGATADA, a conta do cliente será BLOQUEADA permanentemente pelo provedor. Só cancele se tiver certeza."*
- Desabilitar botão de cancelar quando `now() - created_at > 7 dias` (evita 403 na UI)
- `manager-claude-cancel-key/index.ts`: persistir campo `accountBlocked` retornado no `claude_orders.provider_response` para auditoria

---

## FASE 3 — Webhooks (elimina polling) 🟡

Substituir sincronização manual por eventos push do provedor.

**3.1 Nova edge function pública `claude-provider-webhook`**
- `verify_jwt = false`
- Valida HMAC-SHA256 do header `X-Signature` usando `CLAUDE_WEBHOOK_SECRET`
- Roteia eventos:
  - `key.created` → auditoria
  - `key.redeemed` → marca `claude_orders.redeemed_at` + `status='redeemed'` + Telegram pro revendedor + Evolution WhatsApp
  - `key.cancelled` → sync do status caso venha de fora
  - `key.expired` → notificação pro revendedor (oportunidade de renovação)
  - `tokens.limit_reached` → notificação pro cliente/revendedor

**3.2 Nova tabela `claude_provider_webhook_events`**
Já existe (vi na listagem). Verificar schema e reutilizar.

**3.3 Registrar URL no provedor**
- Nova edge function `claude-webhook-register` (gerente only) que chama `POST /api/rsl/webhooks` com a URL da nossa function pública
- Guardar `webhookKey` retornado em secret via `set_secret`
- UI de gerente pra registrar/atualizar/remover a URL

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
