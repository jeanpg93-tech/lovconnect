## Objetivo
Implementar um sistema único de **validação de precificação** (custo + venda) que protege revendedores e o sistema de:
- Vender com **custo zero/indefinido** (erro de cadastro do gerente → revendedor perderia o lucro).
- Vender com **venda zero** (revendedor não recebe nada).
- Vender com **venda < custo** (prejuízo direto).
- Vender com **venda = custo** (margem zero, sem lucro).

Tudo é **bloqueio** nas vendas, com **aviso amarelo** quando não há prejuízo (custo zero / margem zero) e **aviso vermelho urgente piscando** quando há prejuízo (venda < custo) ou venda zero.

**Não altera nenhum preço já cadastrado.** Apenas adiciona camada de validação + UI de alerta.

---

## Regras de validação (fonte única da verdade)

Para cada produto (licença `flow/lovax × pack` e recarga de créditos `pack`):

| Situação | Severidade | Vendas |
|---|---|---|
| `cost = 0` ou `null` (gerente não definiu) | **amarelo** | **bloqueia** |
| `sale = 0` (revendedor não cadastrou) | **vermelho piscando** | **bloqueia** |
| `sale < cost` (prejuízo) | **vermelho piscando** | **bloqueia** |
| `sale = cost` (margem zero) | **amarelo** | **bloqueia** |
| `sale > cost` | ok | libera |

Aplica-se a **todos os revendedores** (resolvido on-the-fly, não depende de dado novo).

---

## Backend — edge function única `pricing-issues`

Nova função `supabase/functions/pricing-issues/index.ts` (verify_jwt = false, valida JWT em código):
- **GET / sem args** → retorna issues do revendedor logado.
- **POST `{ reseller_id }`** (apenas gerente, via `has_role`) → permite consultar outro revendedor.
- **POST `{ check: { kind: 'license'|'credits', method?, pack_id?, credits_amount?, sale_cents } }`** → valida 1 item específico (usado pelas páginas de preço antes de salvar).

Internamente, ela reproduz as cascatas que já existem:
- **Custo de licença**: `reseller_license_cost_overrides` → `app_settings.licencas.valores[method][pack][tier]` → fallback Partner→Ouro → método irmão (igual a `MethodPriceTable.computeBase` e `place-method-license-order`).
- **Venda de licença**: `reseller_license_prices` (por método/pack).
- **Custo de crédito**: RPC `get_credit_pack_cost(reseller_id, plan_id)` (já existe).
- **Venda de crédito**: `reseller_credit_prices`.

Retorna:
```json
{
  "has_blocking": true,
  "has_critical": true,
  "issues": [
    { "kind":"license","method":"flow","pack_id":"7d","label":"Flow 7 dias",
      "cost_cents":0,"sale_cents":1990,"severity":"warning","reason":"cost_missing" },
    { "kind":"credits","credits_amount":500,"label":"500 créditos",
      "cost_cents":2500,"sale_cents":2000,"severity":"critical","reason":"sale_below_cost" }
  ]
}
```

Razões: `cost_missing`, `sale_missing`, `sale_below_cost`, `margin_zero`.

---

## Backend — bloqueio nas vendas (servidor é a fonte de verdade)

Em cada função de venda, antes de criar o pedido, chamar um helper interno (mesma lógica do `pricing-issues`, módulo compartilhado por cópia já que functions não compartilham imports) e abortar com `{ error: "pricing_blocked", reason, severity }` se houver problema **naquele item específico**:

1. `storefront-create-order` — loja pública (licença + créditos).
2. `place-method-license-order` — venda manual de licença pelo revendedor.
3. `reseller-recharge-api` (criação de pedido manual de recarga) e `reseller-credits-api` — venda manual / API de créditos.
4. `reseller-api` — API pública do revendedor (licenças).

Mensagens claras: `"Venda bloqueada: custo do produto não foi definido pelo gerente"` / `"... preço de venda abaixo do custo"` etc.

---

## Bloqueio no cadastro de preço (revendedor)

Em `MethodPriceTable.tsx` (licenças) e `RevendedorCreditos.tsx` (créditos), no `onSave`:
- Se `base (custo) = 0` → bloqueia salvar com toast amarelo: *"O custo desse produto ainda não foi definido. Aguarde o gerente regularizar antes de cadastrar o preço."*
- Se `valor < base` → bloqueia com toast vermelho: *"O valor que você está tentando cadastrar (R$ X) é abaixo do custo (R$ Y). Você teria prejuízo."*
- Se `valor = base` → bloqueia com toast amarelo: *"Esse preço é igual ao custo. Você não teria lucro. Aumente o valor para vender."*

Nada disso altera preços existentes, só impede novos salvamentos ruins.

---

## Frontend — hook + alertas visuais

**Novo hook `src/hooks/usePricingIssues.ts`**
- Chama `pricing-issues` na montagem + a cada 60s.
- Retorna `{ issues, hasBlocking, hasCritical, loading, refresh }`.
- Usado por: Dashboard, página de Preços, página da Loja.

**Componente `src/components/painel/PricingIssuesBanner.tsx`**
- Vermelho piscando (animação `animate-pulse` em token semântico) quando `hasCritical`.
- Amarelo estático quando só warnings.
- Lista compacta dos itens problemáticos + botão **"Corrigir agora"** → `/painel/revendedor/precos?tab=...`.
- Aparece em:
  - `RevendedorDashboard` (topo).
  - `RevendedorPrecos` (acima das abas, e linha vermelha/amarela no item específico nas tabelas).
  - `RevendedorMinhaLoja` (avisando que produtos X estão ocultos da loja).

**Marcação nas tabelas de preço**
- `MethodPriceTable` e `RevendedorCreditos`: cada linha problemática ganha borda lateral (vermelha ou amarela), ícone de alerta e tooltip com a razão.
- Botões "Cadastrar preço" / "Editar" continuam funcionando, mas o save bloqueia conforme regras acima.

**Loja pública (`PublicStorefront`)**
- Itens bloqueados (cost_missing / sale_below_cost / sale_missing / margin_zero) **não aparecem** para o cliente final.
- Filtragem feita já consumindo `pricing-issues` (ou inline no backend que serve o catálogo).

---

## Não-objetivos
- **Não** alterar preços já cadastrados, custos, ou rodar migrations de dados.
- **Não** mexer em RLS, tiers, ou cascatas existentes.
- **Não** mudar o fluxo de PIX/webhook/entrega.

---

## Detalhes técnicos resumidos

```text
pricing-issues (edge fn)
 ├── auth: JWT em código → resolve reseller_id (ou aceita gerente passando outro)
 ├── carrega: tier, licencas.valores, reseller_license_prices,
 │            reseller_license_cost_overrides, reseller_credit_prices,
 │            credit_pricing_plans + get_credit_pack_cost por pack
 ├── computa cost/sale por item (mesma cascata do MethodPriceTable)
 └── classifica → issues[]

usePricingIssues  →  PricingIssuesBanner + linhas marcadas
storefront-create-order / place-method-license-order /
reseller-recharge-api / reseller-credits-api / reseller-api
  → revalida o item específico antes de criar pedido
```

Arquivos novos:
- `supabase/functions/pricing-issues/index.ts`
- `src/hooks/usePricingIssues.ts`
- `src/components/painel/PricingIssuesBanner.tsx`

Arquivos editados (sem mudar lógica de preço, só validação/UI):
- `src/components/painel/MethodPriceTable.tsx` (bloqueio no save + marca linha)
- `src/pages/painel/RevendedorCreditos.tsx` (bloqueio no save + marca linha)
- `src/pages/painel/RevendedorDashboard.tsx` (banner)
- `src/pages/painel/RevendedorPrecos.tsx` (banner)
- `src/pages/painel/RevendedorMinhaLoja.tsx` (banner + aviso de produto oculto)
- `src/pages/PublicStorefront.tsx` (filtra itens bloqueados)
- 5 edge functions de venda (chamada ao validador antes de criar pedido)
