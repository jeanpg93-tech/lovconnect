# Cancelamento de venda pelo revendedor (pós-pagamento)

Recapitulando sua lógica, passada a limpo, com os pontos que eu validei no código atual e os detalhes operacionais que precisam ficar combinados.

## Visão geral do fluxo

```text
Revendedor clica "Cancelar venda"
        │
        ▼
1) REVOGAR CHAVE  ───── falhou? ──► para tudo, alerta gerente, nada de estorno
        │ ok
        ▼
2) ESTORNO AO CLIENTE  (modal com 2 caminhos)
   ├─ Automático via MisticPay (se saque habilitado)
   │     cliente informa chave PIX → cash-out → desconta da MisticPay do revendedor
   └─ Manual (saque não habilitado OU revendedor escolheu)
         revendedor combina por fora e marca "cliente reembolsado"
        │
        ▼
3) Botão "Reembolsar meu saldo" fica habilitado
        │
        ▼
4) Saldo do painel volta pro revendedor (crédito do que foi debitado na venda)
```

Regra de ouro: **etapa 2 e 4 só rodam se a etapa 1 deu certo.** Se a revogação falhar, a venda fica travada em "cancelamento pendente" e cai pro gerente resolver — nada de devolver saldo enquanto a chave ainda estiver ativa, senão o revendedor pode resetar e revender.

## Etapas detalhadas

### 1. Revogação da chave (sempre primeiro)
- Chama o provedor da extensão e revoga a chave.
- Marca a venda como `cancellation_pending` + `key_revoked_at`.
- Se falhar: status vira `cancellation_failed`, dispara notificação pro gerente (Telegram + tela de Estornos), e bloqueia os botões de estorno/refund de saldo até alguém resolver manualmente.

### 2. Estorno ao cliente — modal com checagem da MisticPay
Ao clicar em "Cancelar venda", o sistema consulta a MisticPay do revendedor (`/api/users/info` com as credenciais dele) e decide o que mostrar no modal:

**Caso A — Saque habilitado na MisticPay do revendedor**
- Modal explica: "Você pode reembolsar o cliente automaticamente. O valor sai direto da sua conta MisticPay."
- Pede a **chave PIX do cliente** (CPF / e-mail / telefone / aleatória) + confirmação.
- Dispara cash-out via MisticPay → marca venda como `refunded_auto` com o `endToEndId` retornado.
- Se o cash-out falhar (saldo MisticPay insuficiente, chave inválida, etc.), mostra o erro e oferece cair pro fluxo manual.

**Caso B — Saque NÃO habilitado**
- Modal explica o que falta na MisticPay e como habilitar (verificação de conta + liberar saque), com link/ instruções.
- Oferece o botão "Já reembolsei o cliente por fora" → marca venda como `refunded_manual` + timestamp + (opcional) campo de observação/comprovante.
- Tag "Cliente reembolsado" aparece no card da venda.

### 3. Botão "Reembolsar meu saldo"
- Só aparece quando: `key_revoked_at IS NOT NULL` **E** (`refunded_auto` OU `refunded_manual`).
- Texto: "Devolver para o meu saldo do painel o valor desta venda".
- Mostra quanto vai voltar (o custo que foi debitado na venda original).

### 4. Crédito do saldo do painel
- Ao confirmar, credita o `cost_cents` original de volta em `reseller_balances` via `credit_reseller_balance(..., 'order_refund', ...)`.
- Status final da venda: `cancelled_refunded`.
- Aparece no extrato do revendedor como "Estorno de venda #XXXXX".
- Dispara notificação Telegram (já existe trigger pra `order_refund`).

## O que muda no banco

- `storefront_orders`: novas colunas
  - `cancellation_status` (`none | pending | key_revoked | client_refunded | balance_refunded | failed`)
  - `key_revoked_at`, `client_refund_method` (`auto | manual`), `client_refunded_at`
  - `client_refund_pix_key`, `client_refund_endtoend_id` (quando automático)
  - `balance_refunded_at`
- `orders` (vendas de licença feitas pelo painel/API): mesmas colunas equivalentes.

## O que muda no código

- **Edge function nova `cancel-order`**: orquestra revogar chave → (opcional) cash-out MisticPay → atualizar status. Não credita saldo.
- **Edge function nova `refund-order-balance`**: valida pré-condições e credita o saldo.
- **Edge function nova `check-misticpay-withdraw`**: consulta se o saque do revendedor está liberado (usada pelo modal).
- **UI no painel do revendedor** (lista de vendas / detalhe da venda):
  - Botão "Cancelar venda" nas vendas `paid`/`delivered`.
  - Modal com os dois caminhos (auto / manual) baseado na checagem.
  - Botão "Reembolsar meu saldo" condicionado às etapas anteriores.
  - Tags visuais: "Chave revogada", "Cliente reembolsado", "Saldo estornado".

## Pontos que dependem de decisão sua

1. **Janela de tempo**: cancelar para sempre, ou limitar (ex: 7/30 dias após pagamento)?
2. **Vendas pela API do revendedor (não-storefront)**: aplicar o mesmo fluxo? (recomendo sim, com webhook `order.refunded` que já existe.)
3. **Comprovante no manual**: exigir upload de print/comprovante PIX, ou só checkbox de confirmação?
4. **Se cash-out automático falhar no meio**: cair automaticamente pro manual ou só mostrar erro e deixar o revendedor decidir?

Se você confirmar (ou ajustar) esses 4 pontos, eu já mando a migration + as edge functions + a UI.