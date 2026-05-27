## Objetivo

Fazer a promoção ativa: (1) aplicar desconto/bônus de verdade nas vendas e recargas, (2) ficar visível no dashboard e (3) ser anunciada nas notificações do Telegram.

---

## 1. Banco — rastreabilidade

Migração adicionando colunas opcionais (não quebra nada existente):

- `storefront_orders`: `promotion_id uuid`, `promotion_discount_cents bigint default 0`
- `orders`: `promotion_id`, `promotion_discount_cents`
- `reseller_credit_purchases`: `promotion_id`, `promotion_discount_cents`
- `recharge_intents`: `promotion_id` (a coluna `bonus_cents` já existe)
- `balance_transactions`: `promotion_id uuid` (para filtrar bônus por promoção)

Novo `kind` de transação: `promotion_bonus` (crédito extra após recarga confirmada).

---

## 2. Edge functions — aplicar nos fluxos

Em cada função, no momento de calcular o `cost_cents` final:

1. `SELECT * FROM get_active_promotion()` (ou usar defaults do `global_settings` se não houver promoção)
2. Aplicar percentual sobre o custo base
3. Gravar `promotion_id` + `promotion_discount_cents` no registro

**Funções afetadas:**

| Função | Tipo de desconto |
|---|---|
| `storefront-create-order` | extensão OU créditos (depende do produto) |
| `place-method-license-order` | extensão |
| `place-reseller-order` | extensão |
| `reseller-credits-api` | créditos |
| `reseller-recharge-api` | créditos |
| `lovable-credits-api` | créditos |
| `misticpay-webhook` | confirma pagamento + aplica bônus de recarga |

**Bônus de recarga (`recharge_bonus_pct`):** quando a recarga é confirmada no `misticpay-webhook`, criar transação extra:

```
INSERT balance_transactions (kind='promotion_bonus',
  amount_cents=bonus, promotion_id=X,
  description='🎁 Bônus promoção "Black Friday" (+10%)')
```

---

## 3. Telegram — incluir info da promoção

Atualizar trigger `trg_telegram_balance_tx`:

- Quando `promotion_id` estiver presente na transação ou no pedido relacionado, adicionar linha:
  - `🎉 Promoção aplicada: <nome> (−R$ X)` para descontos
  - `🎁 Bônus de promoção: <nome> (+R$ X)` para bônus de recarga
- Para `kind='promotion_bonus'`: nova mensagem dedicada (`🎁 Bônus de promoção creditado`).

---

## 4. Dashboard — visibilidade

**Onde mostrar:**

- **Vendas recentes** (gerente): badge "Promo: Nome −R$X" ao lado de cada linha que tem `promotion_id`.
- **Histórico do revendedor** (`/painel/revendedor/historico` e equivalente): mesma badge nas compras + linha separada do bônus.
- **Detalhe do pedido** (modal/página): bloco mostrando preço bruto → desconto da promoção → preço final.
- **Recargas**: badge "+R$X de bônus (promoção)".

**Componente reutilizável:** `<PromotionAppliedBadge promotion_id discount_cents />` que busca o nome da promoção (cache local via React Query).

---

## 5. Ordem de execução

1. Migração (colunas + kind)
2. Atualizar trigger Telegram
3. Atualizar as 7 edge functions (uma por uma, testando)
4. Adicionar componente + badges no frontend
5. Validar com 1 venda real de teste após cada bloco

---

## Pontos técnicos

- **Fallback:** Se `get_active_promotion()` retornar vazio, usar os 3 valores de `global_settings` (descontos padrão) como base. Nesses casos `promotion_id` fica `NULL` mas `promotion_discount_cents` ainda guarda o valor descontado, para fins de auditoria.
- **Idempotência do bônus:** verificar se já existe `balance_transactions` com `kind='promotion_bonus'` e `reference_id=recharge_intent_id` antes de inserir (mesma técnica do `activation_credit`).
- **RLS:** novas colunas seguem as policies já existentes das tabelas.
- **Tipos TS:** `src/integrations/supabase/types.ts` regenera sozinho após a migração.

---

## O que NÃO está no escopo

- Histórico/relatório agregado de "quanto a promoção X gerou em descontos" — fica para próxima iteração se você quiser.
- Banner no storefront público mostrando "Promoção ativa". Posso adicionar depois.
