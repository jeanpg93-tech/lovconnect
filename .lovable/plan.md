## Diagnóstico

A venda exibida (id local `f7562f2b...`, provider id `84cbe5ca...`) foi feita pelo revendedor `luxoapplez` (`dcf5995d-2dd4-4030-8ab1-483940e98c3a`) via **API de revendedor** (`reseller-credits-api`), não pela lojinha.

- Override Partner cadastrado em `reseller_credit_cost_overrides`: 20 créditos = **R$ 3,05**
- Valor efetivamente debitado: **R$ 4,90** (espelho do tier Ouro)
- Diferença a estornar: **R$ 1,85**

**Causa raiz:** a função `findPackagePrice` em `supabase/functions/reseller-credits-api/index.ts` (linha 133) lê o preço apenas de `tier_credit_prices` e ignora completamente `reseller_credit_cost_overrides` e o fallback Partner→Ouro. A lojinha (`storefront-create-order`) está correta porque usa a RPC `get_credit_pack_cost`, que aplica a precedência: override individual → tier → Partner→Ouro → preço base. A API do revendedor não usa essa RPC.

Resultado: qualquer Partner com preço individual cadastrado é cobrado pelo preço do tier (Ouro) ao usar a API, em vez do override.

## Correção

### 1. Edge function `reseller-credits-api`

Reescrever `findPackagePrice` para usar a mesma RPC oficial:

```ts
const findPackagePrice = async (credits: number) => {
  const { data: plan } = await svc
    .from("credit_pricing_plans")
    .select("id, credits_amount, label, is_active")
    .eq("credits_amount", credits)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) return null;
  const { data: cost } = await svc.rpc("get_credit_pack_cost", {
    _reseller_id: reseller.id,
    _plan_id: plan.id,
  });
  const price_cents = Number(cost ?? 0);
  if (price_cents <= 0) return null;
  return { plan, price_cents };
};
```

Isso conserta os três pontos de uso (`GET /orcamento`, POST pedido normal e o segundo fluxo POST nas linhas 308/366/753).

### 2. Estorno do caso atual

Aplicar via migration/insert:

- Creditar **+185** centavos no saldo do revendedor `dcf5995d-2dd4-4030-8ab1-483940e98c3a` chamando `credit_reseller_balance` com `kind = 'manual_credit'` e `description = "Estorno R$1,85 — cobrança a maior na compra 20 créditos (id f7562f2b...) por bug de preço Partner"` e `reference_id = f7562f2b-f1b5-4c41-b8b3-d6a8881e7ece`.
- Atualizar a compra `f7562f2b-f1b5-4c41-b8b3-d6a8881e7ece`: `price_cents = 305` (refletindo o preço correto) — campo `cost_cents` fica como já está (190), pois é o custo upstream do provedor (não afeta o saldo).

### 3. Auditoria (recomendado, mas pergunto antes)

Posso fazer uma varredura em `reseller_credit_purchases` (status `sucesso`/`processando`/`aguardando`) para identificar outras compras de partners feitas via API após a data em que os overrides foram cadastrados (24/05/2026 ~10:54) onde `price_cents` ficou ≠ ao override vigente, e estornar todas. **Pergunto antes de aplicar.**

## Arquivos / mudanças

- `supabase/functions/reseller-credits-api/index.ts` — reescrever `findPackagePrice` para usar `get_credit_pack_cost`.
- Insert de saldo + update da compra atual (caso `f7562f2b...`).
- (Opcional) Varredura e estornos para outras compras afetadas.

## Validação

1. Após deploy, chamar `GET /reseller-credits-api?action=orcamento&creditos=20` autenticado como o partner → deve retornar `precoCentavos: 305`.
2. Conferir saldo de `luxoapplez` ganhou +185 centavos e `balance_transactions` registra o estorno.
3. Próxima compra do partner debita o valor correto.
