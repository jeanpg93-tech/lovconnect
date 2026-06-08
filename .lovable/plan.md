## Objetivo
Permitir que o cliente final compre o "Plano 3.000 Créditos" direto na loja do revendedor, pagando via PIX (MisticPay), sem intervenção manual.

## Escopo

### 1. Nova aba "Planos" na loja pública (`PublicStorefront.tsx`)
- Adicionar terceira aba ao lado de "Ativar extensão" / "Recargas na conta".
- Listar planos onde o revendedor já definiu `sale_price_cents > 0` E `is_active = true` no `reseller_recharge_plan_prices`.
- Card por plano mostrando: nome, duração (30 dias), créditos/dia, total, preço de venda.
- Ao selecionar, mostrar formulário inline: Nome do cliente + WhatsApp (opcional) + Email do bot (pré-validado com o `bot_owner_email` que o gerente cadastrou).

### 2. Edge function `recharge-plan-storefront-checkout`
- Recebe `{ reseller_slug, plan_id, customer_name, customer_whatsapp, customer_email }`.
- Valida plano ativo + preço do revendedor + email do bot bate com o exigido.
- **NÃO** debita saldo ainda. Cria registro `pending_storefront` na tabela de assinaturas (status novo: `awaiting_payment`).
- Chama MisticPay do revendedor para gerar o PIX (igual ao fluxo de recarga atual).
- Retorna `{ qr_code, copia_cola, order_token }`.

### 3. Webhook `misticpay-webhook` — extensão
- Quando o pagamento confirmar e o `reference` apontar para uma assinatura de plano:
  - Debita o `cost_cents` do saldo da plataforma do revendedor (mesma regra do manual/API).
  - Se saldo insuficiente: marca assinatura como `payment_received_no_balance` e notifica o revendedor (toast no painel + email opcional). O cliente já pagou, então o revendedor precisa recarregar o saldo pra liberar.
  - Se OK: muda status para `awaiting_owner` (cliente já pode acessar `/plano/:token` pra confirmar email do bot e iniciar entregas).
- Reaproveita lógica existente do webhook; só adiciona branch novo.

### 4. Migração — schema mínimo
- Novos status no enum (ou texto livre, conforme já está): `awaiting_payment`, `payment_received_no_balance`.
- Coluna `misticpay_transaction_id` na assinatura (pra dedupe no webhook).
- Coluna `source` já existe; usar valor `storefront`.

### 5. Página `/plano/:token` (já existe)
- Adicionar tratamento dos novos status: `awaiting_payment` mostra QR code + copia-cola; `payment_received_no_balance` mostra "Aguardando confirmação do revendedor".

## Fora de escopo (próximas fases)
- Notificações 21h BRT (Fase 3b notificações).
- Cancelamento manual no painel + listagem do revendedor.
- Refund automático em caso de chargeback PIX.

## Confirmações antes de codar
1. Confirma que o débito do `cost_cents` deve acontecer **quando o PIX confirmar** (não na criação do pedido)?
2. Em caso de saldo insuficiente no momento do pagamento, segue a regra "fica preso até o revendedor recarregar"?
