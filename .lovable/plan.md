## Objetivo

Permitir que o gerente estorne, com confirmação, **vendas canceladas de créditos (recargas)** e **vendas canceladas de licenças**, devolvendo o valor ao saldo do revendedor. Tudo responsivo, mobile-first.

---

## 1. Backend — nova edge function `gerente-estornar-venda`

Função única que cobre os dois tipos (`credits` e `license`).

**Entrada (POST):**
```json
{ "tipo": "credits" | "license", "provider_pedido_id": "..." , "observacao": "opcional" }
```

**Fluxo:**
1. Valida JWT e checa `has_role(user, 'gerente')`. Senão → 403.
2. Valida body com Zod.
3. **Se `tipo = credits`:**
   - Busca `reseller_credit_purchases` por `provider_pedido_id`.
   - Se não encontrado → 404. Se `status = 'estornado'` → 409 (idempotência).
   - `UPDATE` status = `'estornado'`.
   - Chama `credit_reseller_balance(reseller_id, price_cents, 'credit_purchase_refund', 'Estorno pedido <id>', purchase_id)`.
4. **Se `tipo = license`:**
   - Busca `orders` por `provider_response->>'pedidoId' = provider_pedido_id` **ou** por `id` (UUID interno) — o painel passa o id mais conveniente.
   - Se não encontrado → 404. Se já houver `balance_transactions` com `kind='license_purchase_refund'` e `reference_id = order.id` → 409.
   - `UPDATE orders SET status='estornado', notes = coalesce(notes,'') || ' [estorno gerente]'`.
   - Chama `credit_reseller_balance(reseller_id, price_cents, 'license_purchase_refund', 'Estorno licença <id>', order.id)`.
5. Insere `admin_audit_logs` com `action='refund_sale'` e detalhes (tipo, valor, pedido, observação).
6. Retorna `{ ok: true, refunded_cents }`.

CORS + tratamento de erros com mensagens claras.

---

## 2. Frontend — componente compartilhado `RefundSaleDialog`

`src/components/painel/RefundSaleDialog.tsx`:
- Modal (`Dialog` shadcn) com:
  - Tipo da venda, revendedor, valor a estornar (BRL), id do pedido.
  - Textarea opcional "Observação".
  - Botões **Cancelar** / **Confirmar estorno** (loading state).
- Responsivo: `max-w-md`, padding adaptado, botões empilhados em telas `< sm`.
- Chama `invokeAuthenticatedFunction("gerente-estornar-venda", ...)`, toast de sucesso/erro, dispara `onSuccess()` para recarregar a lista.

---

## 3. Tela "Acompanhar Recargas" (`GerenteAcompanharRecargas.tsx`)

- Em cada linha/cartão cujo `status === 'cancelado'`:
  - Consultar uma vez (junto do `load`) `reseller_credit_purchases` para descobrir quais `provider_pedido_id` já estão com `status='estornado'`.
  - Se **cancelado e ainda não estornado** → mostrar botão **"Estornar"** (vermelho, icon `Undo2`).
  - Se já estornado → badge **"ESTORNADO"** discreto, sem botão.
- **Mobile:** botão icon-only (`size="icon"`, `h-8 w-8`) dentro do card; **Desktop (`sm:`)** mostra `icon + texto`.
- Clique abre `RefundSaleDialog` com `tipo="credits"`.

---

## 4. Tela "Acompanhar Licenças" (`GerenteLicencasAcompanhar.tsx`)

- Adicionar à `computeStatus` o caso **canceled/cancelado/queimado** (status vindo de `provider-api`/`lovax-api` quando o fornecedor marca como cancelado) retornando `kind: "canceled"` com badge vermelho.
- Cruzar com `balance_transactions` (kind `license_purchase_refund`) e/ou `orders.status='estornado'` para saber se já foi estornado.
- Mostrar botão **"Estornar"** apenas quando: status canceled **E** ainda não estornado **E** existe `orders.price_cents > 0` para devolver.
- Mesmo padrão responsivo (icon-only no mobile, icon+texto no desktop).
- Abre `RefundSaleDialog` com `tipo="license"`.

---

## 5. Banco / migrações

Não há mudança de schema. Apenas dados:
- Status `'estornado'` em `reseller_credit_purchases.status` (texto livre, já aceita).
- Status `'estornado'` em `orders.status` (idem).
- Novo `kind = 'license_purchase_refund'` em `balance_transactions` — adicionar mapeamento de label em `RevendedorTransacoes.tsx` ("Estorno de licença"). `credit_purchase_refund` já existe.

---

## 6. Responsividade (regras aplicadas em ambas as telas)

- Botão de estorno: `sm:gap-1.5 sm:px-3` com texto; em mobile só ícone (`<Undo2 className="h-4 w-4" />`).
- Dialog: largura `w-[95vw] max-w-md`, conteúdo com `text-sm`, footer `flex-col-reverse sm:flex-row sm:justify-end gap-2`.
- Badges de "ESTORNADO" e "CANCELADO" mantêm tamanho `text-[9px]` consistente com o resto.

---

## 7. Segurança

- Edge function exige `gerente`.
- Idempotência por status + checagem de transação existente.
- Logs em `admin_audit_logs` (já tem RLS de gerente).

---

## 8. Testes manuais pós-implementação

1. Pedido de créditos cancelado (`luxoapplez@gmail.com`, R$ 9,35) → clicar Estornar → confirmar → saldo do revendedor sobe R$ 9,35, status vira ESTORNADO, botão some.
2. Tentar estornar de novo → erro 409 "já estornado".
3. Verificar em `/painel/revendedor/transacoes` que aparece "Estorno" como crédito positivo.
4. Repetir o fluxo para uma venda de licença cancelada.
5. Testar tudo em viewport 375px (mobile).
