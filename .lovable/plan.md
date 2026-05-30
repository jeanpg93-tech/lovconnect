## Visão geral

Novo modelo de billing **Revendedor Pacote** (3º modelo, junto com prepago e mensalista). Revendedor compra pacotes de N créditos de chave. Cada licença gerada (1d/7d/30d/lifetime/etc) consome **1 crédito**, sem débito em R$ nem promoções. Trial é gratuito (não consome). Créditos não expiram e acumulam entre compras. Quando o saldo zera, painel é bloqueado para geração até comprar novo pacote.

## Regras de negócio

- **billing_mode = `package`** (novo valor na coluna `resellers.billing_mode`).
- Revendedor Pacote **não** tem saldo em R$, **não** vê preços de licença, **não** participa de promoções.
- Toda chave gerada (qualquer tipo, qualquer método) consome **1 crédito** do saldo de pacote.
- **Trial é grátis** e ilimitado (mesma lógica do mensalista).
- Saldo zerado → overlay de bloqueio idêntico ao mensalista, CTA "Comprar pacote".
- Compras são via Pix/MisticPay (mesma infra de recarga). Após `paid`, créditos entram automaticamente.
- Créditos **acumulam**: comprar novo pacote antes de zerar soma ao saldo atual.
- Histórico completo de compras e consumo (cada chave gerada loga -1 crédito).

## Sugestão de pacotes e preços

Custo médio atual de chave 30d para revendedor: **~R$ 18** (tier intermediário). Como o revendedor pode usar 1 crédito para gerar uma **lifetime** (que custaria muito mais no modelo prepago), precisamos de margem extra. Sugestão inicial (gerente pode ajustar a qualquer momento):

| Pacote | Créditos | Preço sugerido | Preço/chave | Desconto |
|--------|----------|----------------|-------------|----------|
| Starter | 10 | R$ 250 | R$ 25,00 | — |
| Plus | 25 | R$ 575 | R$ 23,00 | 8% |
| Pro | 50 | R$ 1.075 | R$ 21,50 | 14% |
| Mega | 100 | R$ 1.950 | R$ 19,50 | 22% |

Preços e quantidades são **100% configuráveis pelo gerente** em `/painel/gerente/pacotes`. Recomendação: começar com esses 4 e ajustar com base no uso real.

## Páginas e fluxos

**Gerente:**
- `/painel/gerente/pacotes` — CRUD de pacotes (nome, créditos, preço, ativo).
- `/painel/gerente/revendedores/:id/pacote` — ver saldo de créditos, histórico de compras e consumo, creditar manualmente.
- Dashboard ganha notificação Telegram quando revendedor pacote gera chave (já temos infra do mensalista).
- Listagem de revendedores ganha badge "📦 Pacote" e coluna "Créditos restantes".

**Revendedor pacote:**
- `/painel/revendedor/landing` mostra card destacando créditos restantes (em vez de saldo R$).
- `/painel/revendedor/gerar-chave` decrementa crédito ao gerar, mostra "Restam X créditos".
- `/painel/revendedor/comprar-pacote` — vitrine de pacotes disponíveis com Pix.
- `/painel/revendedor/historico-pacote` — extrato de créditos (compras + consumos).
- Telas de "Preços", "Promoções", "Saldo R$" ficam ocultas.

## Detalhes técnicos

**Tabelas novas:**
- `license_packages` — catálogo de pacotes (id, name, credits, price_cents, is_active, sort_order).
- `reseller_package_balances` — saldo de créditos por revendedor (reseller_id, credits, updated_at).
- `reseller_package_purchases` — compras (reseller_id, package_id, credits, price_cents, status, misticpay_tx_id, paid_at).
- `reseller_package_ledger` — extrato granular (reseller_id, kind: `purchase|consume|admin_credit|refund`, delta_credits, order_id?, purchase_id?, note).

**Schema:**
- `resellers.billing_mode` ganha valor `package`.
- Trigger em `reseller_package_purchases` ao virar `paid`: credita saldo + escreve no ledger.
- Função RPC `consume_package_credit(reseller_id, order_id)` para débito atômico (com check de saldo > 0).

**Edge functions:**
- `package-generate-key` — irmã da `subscription-generate-key`, valida saldo, chama provedor, decrementa crédito, notifica Telegram.
- `package-create-purchase` — cria cobrança Pix MisticPay para um pacote.
- `misticpay-webhook` ganha branch para `package_purchase` (credita após pagamento).

**Bloqueio:**
- Componente `PackageLockOverlay` idêntico ao `SubscriptionLockOverlay`, ativa quando `billing_mode='package'` e `credits=0`.

**Realtime:**
- Subscription no saldo de créditos para atualizar UI sem refresh.

## Fora do escopo (para conversar depois)

- Migração de revendedores existentes para o modelo pacote.
- Pacotes com tipos específicos (ex: "10 chaves de 30d") — fica para v2 se fizer sentido.
- Auto-recarga / assinatura de pacote mensal.
- Cashback / promoções específicas de pacote.

## Próximos passos

Me confirma:
1. Os nomes e preços dos 4 pacotes iniciais (ou ajusta).
2. Se topa "Revendedor Pacote" como nome interno ou prefere outro (Bundle, Pacotão, Combo, Box).
3. Se a compra é só via Pix MisticPay ou também aceita aprovação manual (gerente credita).

Quando alinharmos, eu implemento na ordem: schema → admin (CRUD + listagem) → fluxo de compra → geração com débito → bloqueio.
