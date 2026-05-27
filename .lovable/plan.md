# Refatoração de preços de custo — RECARGAS

Objetivo: eliminar todas as fontes paralelas de preço e deixar **uma única regra**: "pegue o tier do revendedor → leia o preço daquele tier para o pacote". Sem overrides, sem fallback, sem espelho.

---

## 1. Fonte única de verdade

Tabela única: `tier_credit_prices` (já existe), agora também com linhas para o tier **Partner** (que já existe em `reseller_tiers` com `sort_order=999`).

A página `/painel/gerente/recargas` aba **Valores** passa a editar diretamente essa tabela para os 4 tiers (Bronze, Prata, Ouro, **Partner**), exatamente do mesmo jeito que hoje edita Bronze/Prata/Ouro.

---

## 2. Migração de dados (seed do Partner)

Popular `tier_credit_prices` para `tier_id = Partner` usando os valores que estão hoje na coluna Partner (overrides do revendedor de referência "Jean", `dcf5995d-2dd4-4030-8ab1-483940e98c3a`):

| Créditos | Preço Partner |
|---:|---:|
| 20 | R$ 3,05 |
| 100 | R$ 9,35 |
| 200 | R$ 17,75 |
| 300 | R$ 26,15 |
| 500 | R$ 37,70 |
| 1000 | R$ 71,30 |
| 2000 | R$ 131,15 |
| 3000 | R$ 186,80 |
| 5000 | R$ 272,90 |

`reseller_credit_cost_overrides` **não é dropada** — fica como histórico, mas **ignorada** por todo o código novo.

---

## 3. Nova RPC `get_credit_pack_cost` (regra única)

Reescrever a função para fazer **apenas**:

```text
tier = get_reseller_tier(reseller)
return tier_credit_prices.price_cents WHERE tier_id=tier.id AND plan_id=plan AND is_active
```

Sem precedência, sem fallback Partner→Ouro, sem leitura de overrides. Se não houver linha ativa, retorna `0` → a venda é **bloqueada** (em vez de ser cobrada errado).

---

## 4. Unificar leitura nas 7 edge functions

Hoje cada função lê de um lugar diferente. Todas passam a chamar `get_credit_pack_cost(reseller_id, plan_id)` — sem exceção, sem código próprio de preço:

- `lovable-credits-api` (reseller_create_order)
- `reseller-credits-api` (findPackagePrice — bug do luxoapplez)
- `reseller-recharge-api` (POST /pedidos)
- `storefront-create-order`
- `misticpay-webhook` (cobrança no callback)
- `pricing-issues` (validação)
- `reseller-credit-costs` (listagem de custos)

---

## 5. Snapshot de custo na venda

Toda venda nova grava `cost_cents` na linha de `reseller_credit_purchases` / `storefront_orders` **no momento da compra**. Se o preço da coluna Partner mudar amanhã, as vendas antigas continuam com o valor cobrado naquela hora (auditoria e estornos ficam corretos).

---

## 6. Bloqueio quando custo está ausente/zero

Se `get_credit_pack_cost` retornar 0:
- Edge functions retornam erro `PRICE_NOT_SET` (HTTP 400)
- A loja pública mostra "Indisponível"
- O banner `ManagerPricingIssuesBanner` (já existe) lista os pacotes/tiers sem preço para o gerente corrigir

---

## 7. UI

**`/painel/gerente/recargas` → aba Valores**
- Coluna **Partner** vira editável, igual Bronze/Prata/Ouro
- Remover a leitura de espelho (overrides do Jean + fallback Ouro)
- Remover o link "ref: Jean" e o `ExternalLink` que apontava para `/painel/gerente/partners`

**`/painel/gerente/partners`**
- Página inteira removida (rota, link no menu lateral, componente `GerentePartners.tsx`)
- Mesma coisa com `RevendedorPrecos` se ele lê de overrides — passa a ler de `tier_credit_prices` do tier do próprio revendedor

---

## 8. Como atribuir um revendedor ao tier Partner

Continua igual ao que já existe hoje: `reseller_tier_state.forced_tier_id = Partner.id` (já suportado por `get_reseller_tier`). Não muda nada de UX nessa parte.

---

## Ordem de execução (durante a manutenção 00h)

1. Migration: seed `tier_credit_prices` do Partner com os 9 valores acima
2. Migration: reescrever `get_credit_pack_cost` (regra única)
3. Migration: adicionar coluna `cost_cents` em `reseller_credit_purchases` / `storefront_orders` se faltar, e gravar no INSERT
4. Atualizar as 7 edge functions para chamar a RPC
5. Atualizar `GerenteValoresCreditos.tsx` (coluna Partner editável)
6. Remover `/painel/gerente/partners` (rota + sidebar + arquivo + `PartnerPriceHistoryDialog` se órfão)
7. Ajustar `RevendedorPrecos` para ler de `tier_credit_prices`
8. Testes manuais: 1 venda como Bronze, 1 como Partner, via storefront e via API → conferir cobrança igual ao mostrado

---

## Fora deste plano (próxima etapa)

Licenças (MétodoFlow / MétodoLovax) — mesma lógica, mas só depois que recargas estiver 100% validado, conforme você pediu.

---

## Confirmação antes de executar

- Posso considerar os 9 valores acima (do Jean) como definitivos para a coluna Partner?
- Posso remover por completo a página `/painel/gerente/partners` (não vai mais existir esse caminho)?
- Confirma que durante a manutenção a entrega manual está ativa, então posso fazer essas migrations sem afetar venda em andamento?