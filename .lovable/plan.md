# Painel Financeiro Completo — `/painel/gerente/financeiro`

Vou transformar o painel atual (que só lista transações do MisticPay) em um painel financeiro completo com **receita, custos, lucro, margem, gráficos e lançamentos manuais**.

## 1. Origens dos dados (o que já existe)

| Conceito | Fonte | Campo |
|---|---|---|
| **Receita (entrada)** | `recharge_intents` `status='paid'` | `amount_cents` |
| **Custo recargas (saída)** | `reseller_credit_purchases` | `cost_cents` |
| **Custo vendas loja** | `storefront_orders` (product_type='credits' e status pago/entregue) | `cost_cents` |
| **Taxa gateway MisticPay** | Calculado | R$ 0,50 × nº de recargas pagas |
| **Licenças** | Ignorado por enquanto (custo zero) | — |

Os dois `cost_cents` já são salvos historicamente na venda → não preciso recalcular, é confiável.

## 2. Lançamentos manuais (novo)

Você quer poder lançar **vendas por fora** e **gastos avulsos** (software, taxas, atualizações, etc). Vou criar duas tabelas:

- `manual_financial_entries` — uma única tabela com tipo `revenue` ou `expense`, descrição, valor, categoria opcional, data do lançamento e quem lançou.

Só gerentes podem ver/criar/editar/excluir (RLS via `has_role gerente`).

## 3. UI do novo painel

Mantém o filtro de período (Tudo / Hoje / 7 dias / Mês) e organiza em **abas**:

### Aba "Visão Geral" (padrão)
- **6 cards no topo:**
  - 💰 Receita Total (recargas + manuais) — verde
  - 💸 Custo Total (créditos vendidos + gateway + manuais) — vermelho
  - 📈 Lucro Líquido (Receita − Custo) — destaque
  - 📊 Margem % (Lucro / Receita)
  - 🧾 Qtde. Recargas
  - 🛒 Qtde. Vendas
- **Gráfico de linha** (Recharts): Receita vs Custo vs Lucro ao longo do tempo (diário/semanal/mensal conforme período).
- **Breakdown** em barras: Custo dividido em `Créditos vendidos`, `Taxa gateway`, `Gastos manuais`.
- **Top 5 revendedores** por lucro gerado (tabela compacta).

### Aba "Transações"
- A listagem MisticPay atual, intacta (não mexo).

### Aba "Lançamentos Manuais"
- Lista todos os lançamentos manuais (receitas + despesas) com filtro por tipo.
- Botão **"+ Novo lançamento"** abre modal com: tipo (Receita/Despesa), descrição, valor, categoria (texto livre), data.
- Cada linha tem editar/excluir.

## 4. Detalhes técnicos

- **Nenhuma alteração** em valores, custos, pacotes ou licenças (conforme você pediu).
- Nova tabela `manual_financial_entries` com migration + RLS.
- Reaproveita o `recharges` query que já existe em `GerenteFinanceiroGeral.tsx`.
- Adiciona query agregada de `storefront_orders` e `reseller_credit_purchases` (somando `cost_cents`).
- Componente de gráfico usando `recharts` (já no projeto via shadcn `Chart`).
- Modal com `Dialog` + `react-hook-form` + `zod` (padrão do projeto).

## 5. Estrutura de arquivos

```text
src/pages/painel/GerenteFinanceiroGeral.tsx  (refatorado em abas)
src/components/painel/financeiro/
  ├─ FinanceiroVisaoGeral.tsx          (cards + gráficos)
  ├─ FinanceiroTransacoes.tsx          (lista MisticPay atual)
  ├─ FinanceiroLancamentosManuais.tsx  (CRUD)
  └─ ManualEntryDialog.tsx             (modal criar/editar)
src/hooks/useFinancialOverview.ts      (busca + agrega receita/custo)
src/hooks/useManualEntries.ts          (CRUD manuais)
```

## 6. Confirmação antes de implementar

Posso prosseguir? Vou:
1. Criar a migration da tabela `manual_financial_entries`.
2. Refatorar a página em abas mantendo o que já existe na aba "Transações".
3. Adicionar Visão Geral com cards, gráfico e top revendedores.
4. Adicionar CRUD de lançamentos manuais.

Sem tocar em preços, pacotes, licenças ou qualquer outra parte do sistema.
