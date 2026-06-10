# Plano

## 1) Toggle "Marcar como teste" nas vendas

**Banco (migração)**
- Adicionar `is_test BOOLEAN NOT NULL DEFAULT false` em `reseller_credit_purchases` e `storefront_orders` (já existe em `orders`).
- Criar RPC `set_sale_test_flag(_table text, _id uuid, _is_test boolean)` SECURITY DEFINER, restrito a `has_role(auth.uid(),'gerente')`. Aceita as 3 tabelas (`orders`, `reseller_credit_purchases`, `storefront_orders`) por whitelist.
- Atualizar agregações que ainda não filtram `is_test=false`:
  - `useFinancialOverview` precisa filtrar `is_test=false` em `storeOrders`, `rcpArr`.
  - `FinanceiroTransacoes` (lista MisticPay) — sem mudança, é API externa.

**UI**
- Novo componente reutilizável `MarkAsTestButton` (botão pequeno tipo "🧪 Marcar/Desmarcar teste") que chama o RPC.
- Adicionar nos listagens onde o gerente já vê vendas: `GerenteLicencasAcompanhar`, `GerenteTodasLicencas`, `GerenteAcompanharRecargas`, `GerenteVendasLoja`. Botão fica numa coluna de ações (ou dentro do menu existente).
- Vendas marcadas como teste ganham um badge discreto "TESTE".

## 2) Expandir detalhes das vendas por revendedor

**`FinanceiroVisaoGeral.tsx`**
- Linha do revendedor vira `<Collapsible>` (clique para expandir).
- Ao abrir: tabela interna com cada venda do período — data, tipo (extensão/créditos/plano), descrição (extensão ou Nº créditos), receita do dono, custo do dono, lucro.
- Os dados já estão no hook (`soArr`, `rcpArr`, `planSubsArr`, `packArr`), só faltava agruparmos por revendedor. Vou adicionar `resellerSalesDetails: Record<resellerId, Array<{...}>>` ao retorno do hook.

## 3) Taxa MisticPay R$0,50 — lançamento real

**Banco (migração — mesma da #1)**
- Constraint UNIQUE em `manual_financial_entries(reference_kind, (reference_meta->>'tx_id'))` quando `reference_kind='misticpay_fee'` (índice único parcial). Garante idempotência: webhook reentrante não duplica taxa.

**Webhook `misticpay-webhook`**
- Nova função helper `recordMisticPayFee(admin, txId, originKind, originRefId, originLabel)` que insere em `manual_financial_entries`:
  - `entry_type='expense'`, `amount_cents=50`
  - `description='Taxa MisticPay — '+originLabel`
  - `category='gateway_fee'`
  - `reference_kind='misticpay_fee'`
  - `reference_meta={tx_id, origin_kind, origin_id, origin_label}`
  - Ignora erro de duplicate-key (idempotente).
- Chamar essa função em todos os pontos de confirmação de ENTRADA `COMPLETO`:
  - `activation_payments` (R$200 ativação)
  - `recharge_intents` (recarga de saldo)
  - `direct_sales` (checkout do gerente)
  - `reseller_subscription_charges` (mensalidade)
  - `reseller_pack_purchases` (pack pago)
  - `storefront_orders` (recharge_plan + credits)
- NÃO chamar em saída/retirada (já filtrado, webhook só trata `transactionType=DEPOSITO`).

**Frontend `useFinancialOverview.ts`**
- Mudar `GATEWAY_FEE_CENTS_PER_RECHARGE = 50` → `0` (remover simulação). O cálculo de `gatewayFeeCents` passa a vir 100% dos lançamentos reais via `manualMisticFeeCents` (que já existe!).
- A composição do custo na UI continua mostrando "Taxa gateway", mas agora vem dos lançamentos.

**`FinanceiroLancamentosManuais.tsx`**
- Já lista os manuais; as taxas vão aparecer com a descrição e o `reference_meta` (tx_id, origem). Adicionar uma seção de "detalhes" expansível mostrando esses metadados nas entradas de `reference_kind='misticpay_fee'`.

## Arquivos afetados
- Migração nova: cria colunas `is_test`, RPC `set_sale_test_flag`, índice único parcial em `manual_financial_entries`.
- `supabase/functions/misticpay-webhook/index.ts`: adicionar `recordMisticPayFee` e 6 chamadas.
- `src/hooks/useFinancialOverview.ts`: zerar simulação; adicionar `resellerSalesDetails`.
- `src/components/painel/financeiro/FinanceiroVisaoGeral.tsx`: linhas expansíveis.
- `src/components/painel/financeiro/FinanceiroLancamentosManuais.tsx`: mostrar `reference_meta` de taxas.
- Novo `src/components/painel/MarkAsTestButton.tsx`.
- 4 páginas de listagem do gerente: adicionar o botão + badge.

## Observações
- Tudo idempotente: re-execução do webhook não duplica taxa nem afeta saldo.
- Não toca em saldo/receita do revendedor (taxa fica 100% no lado do gerente).
- A simulação atual já contabilizava R$0,50 — então o "Lucro Líquido" não vai mudar de magnitude, só passa a refletir lançamentos reais e auditáveis.
