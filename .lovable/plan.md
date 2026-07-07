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

## FASE 4 — Telemetria de clientes (`GET /api/rsl/users`) ✅

- ✅ `claude-customers-usage` (revendedor) e `manager-claude-provider-users` (gerente) já consomem `/api/rsl/users`, reconciliam status e devolvem `dailyPercentUsed`, `weeklyTokensInWindow`, `weeklyTokenLimit`, `accountExpiresAt`, `tokensConsumed/tokenLimit`, `percentRemaining`.
- ✅ `RevendedorMeusClientesClaude.tsx` já renderiza barra de uso diário, janela semanal, total consumido e badge de expiração.
- ✅ Painel do gerente (`manager-claude-provider-users`) já traz status consolidado por email/keyId/code.

---

## FASE 5 — Endpoint de renovação (`POST /api/rsl/renew`) ✅

- ✅ `reseller-claude-api` já implementa renovação in-place chamando `POST /api/rsl/renew`, cria registro `is_renewal=true`, debita via `debit_reseller_balance` e dispara webhook `claude.key.renewed`.
- ✅ Fluxos de cliente final (`claude-customer-request-renewal`, `claude-customer-checkout-renewal`) já plugados.

---

## FASE 6 — Contas de teste do provedor (`POST /api/rsl/test`) ✅

- ✅ `claude-issue-trial` (revendedor) e `claude-storefront-issue-trial` (loja pública) já chamam `POST /api/rsl/test` sem débito.

---

## FASE 7 — Robustez e observabilidade 🟡 (opcional)

**7.1 Sync automático de preços via `/api/rsl/me`** ✅ — edge function `claude-price-sync` compara `prices[kind]` do provedor com `claude_plan_prices.cost_cents`, envia alerta no Telegram (`telegram_outbox`) com cooldown de 12h e hash de divergência (evita spam). Falta agendar cron (diário) apontando para `claude-price-sync`.

**7.2 Auditoria de UI** — reforço textual "com email (recomendado)" vs "só código" na emissão manual.

**7.3 Rate limit awareness** — retry com backoff em chamadas ao `/me` e evitar polling.

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
