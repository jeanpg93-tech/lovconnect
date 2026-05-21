## Objetivo

Permitir que o revendedor veja suas compras de créditos (entrega `workspace_proprio` via provedor externo) e, quando o provedor cancelar o pedido, ele consiga solicitar o **reembolso automático ao saldo** direto pelo painel — sem depender do admin.

Caso concreto: pedido `674c86dd-…` do luxoapplez, 100 créditos / R$ 9,35, debitado do saldo, cancelado no provider, sem registro de estorno.

---

## O que será construído

### 1. Sincronização do status (polling sob demanda)

Nova edge function **`sync-credit-purchase-status`**:
- Recebe `purchase_id` (ou lista).
- Valida JWT e dono.
- Para cada compra com status local "em aberto" (`aguardando`, `processando`, `manual_pendente`, `manual_iniciado`, `manual_aceito`, `manual_processando`), consulta o provider externo (mesmo endpoint usado por `lovable-credits-public` → `/pedidos/:id`).
- Mapeia a resposta do provider para um status local final:
  - cancelado / invite inválido / falha → `cancelado`
  - sucesso/entregue → `sucesso`
  - resto → mantém atual
- Atualiza `reseller_credit_purchases.status` (e `error_message` se aplicável).
- Retorna o status atualizado.

Chamada automaticamente quando o revendedor abrir a nova aba do painel (em batch para todas as compras "em aberto" dele) e também ao clicar em "Atualizar status" num pedido individual.

### 2. Nova seção no painel do revendedor: "Minhas compras de créditos"

Adicionada como uma **nova seção dentro de `/painel/revendedor/recargas`** (mesma página, abaixo de "Minhas Recargas"), seguindo o mesmo padrão já usado para PIX e licenças:

- Lê de `reseller_credit_purchases` filtrando por `reseller_id`.
- Mostra: id curto, créditos, valor, tipo de entrega, status (badge), data, link público `/recargas/:id`.
- Botão **"Ver todas"** com busca e filtro por status.
- Ao montar, dispara `sync-credit-purchase-status` em background para os pedidos abertos.
- Botão **"Reembolso"** aparece quando status ∈ {`cancelado`, `falha`, `failed`} e ainda não há `refund_requests` para esse pedido.
- Badge "Reembolsado" quando já existe estorno registrado.

### 3. Extensão do fluxo de reembolso

Atualizar a edge function **`request-refund`** existente:
- Aceitar `kind: 'credit_purchase'` (além dos atuais `recharge` e `license`).
- Validar que o `reseller_id` do pedido bate com o do JWT.
- Aceitar apenas status `cancelado` / `falha` / `failed`.
- Conferir `refund_requests` pelo par `(kind, reference_id)` para impedir duplo estorno.
- Inserir em `refund_requests` e creditar o valor (`price_cents`) de volta via `credit_reseller_balance` com `_kind: 'refund'` e descrição "Estorno compra de créditos #<id curto>".

Nada muda no schema — `refund_requests` já tem `kind text` aberto e `UNIQUE(kind, reference_id)`.

### 4. Caso do luxoapplez

Depois do deploy:
1. Ele abre `/painel/revendedor/recargas` → a aba "Minhas compras de créditos" carrega.
2. O sync detecta o cancelamento no provider e atualiza o status local da compra `d22f2678-…` para `cancelado`.
3. Aparece o botão "Reembolso".
4. Ele clica, confirma, e R$ 9,35 voltam ao saldo automaticamente (com registro em `balance_transactions` e `refund_requests`).

Nenhuma ação manual no banco é necessária — o próprio fluxo resolve o caso real e os próximos.

---

## Detalhes técnicos

**Arquivos:**

- `supabase/functions/sync-credit-purchase-status/index.ts` *(novo)*
  - Reusa a mesma lógica de chamada ao provider que `lovable-credits-public` já usa (lê `app_settings`/secrets para a URL e key do provider).
  - Aceita `{ purchase_ids: string[] }` (até 50 por chamada).
- `supabase/functions/request-refund/index.ts` *(editar)*
  - Adicionar branch `kind === 'credit_purchase'` com query em `reseller_credit_purchases`.
- `src/pages/painel/RevendedorRecarga.tsx` *(editar)*
  - Nova seção "Minhas compras de créditos" espelhando a estrutura da seção de Recargas/Licenças.
  - State: `recentCreditPurchases`, `allCreditPurchases`, filtros, `refundedCreditPurchaseIds`.
  - Funções: `loadRecentCreditPurchases`, `loadAllCreditPurchases`, `syncOpenCreditPurchases`, `loadCreditPurchaseRefunds`, `requestCreditPurchaseRefund`.
  - `useEffect` chama o sync logo após carregar a lista.

**Mapa de status do provider → local** (configurado dentro da nova edge function, ajustável):

```text
provider                     → local
---------------------------------------
cancelado / invite_invalido  → cancelado
recusado / falha / error     → falha
concluido / entregue         → sucesso
qualquer outro               → (mantém)
```

**Segurança:**
- Sync e refund validam JWT e que o `reseller_id` do pedido é do usuário (via RPC já existente / select com RLS).
- `refund_requests` tem `UNIQUE(kind, reference_id)` → garante idempotência mesmo com cliques duplicados.
- Sem migration/alteração de schema; tudo cabe na estrutura atual.

**Sem cron / sem webhook do provider** nesta entrega — polling sob demanda é suficiente e funciona independente do que o provider suporta. Se no futuro o provider expuser webhook, dá pra reaproveitar a mesma função de mapeamento.
