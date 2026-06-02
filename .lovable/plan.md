
# Modo de venda para revendedores Pack

Objetivo: revendedor Pack escolhe se Loja Integrada e API entregam licenças consumindo do **Pacote** ou do **Saldo da carteira**. Geração manual continua exatamente como hoje. Mensalistas não são afetados.

---

## Decisões confirmadas

- **A — Geração manual sem créditos:** mantém o comportamento atual. Confirmado no código (`pack-generate-key` retorna `402 "Sem licenças disponíveis. Compre um pacote."` quando `credits < 1`). Nenhuma venda é realizada. **Não muda nada.**
- **B — Toggle único:** uma só chave (`delivery_source = 'pack' | 'wallet'`) vale simultaneamente para Loja Integrada e API.
- **C — Cores do alerta de licenças:**
  - Verde: ≥ 10 licenças
  - **Amarelo: 5 a 9 licenças**
  - **Vermelho: < 5 licenças** (inclui zero)
- **D — Mensalistas:** toggle não aparece. Fluxo deles segue 100% inalterado.
- **E — Fallback Pack → Saldo:** quando estiver em modo Pack e `pack_credits = 0` no momento da entrega de uma venda (Loja ou API), o sistema debita do **Saldo da carteira** automaticamente e entrega a licença. Aparece como transação normal de venda, **com tag visível** `Fallback automático: pacote esgotado`, e cai tanto no dashboard do revendedor quanto no dashboard do gerente.

---

## O que muda

### 1. Banco de dados

- `resellers.delivery_source text default 'wallet'` — só lido quando `billing_mode = 'pack'`.
- `reseller_pack_ledger.kind` ganha valor `sale_consume` (consumo via Loja/API). Mantém `manual_consume` para geração manual.
- `wallet_transactions` (ou tabela equivalente já usada nas vendas): novo flag opcional `fallback_from_pack boolean default false` para marcar transações que aconteceram por esgotamento de pacote.
- Default para revendedores Pack já existentes: `delivery_source = 'wallet'` (mantém comportamento atual; cada revendedor ativa quando quiser).

### 2. Backend (edge functions)

Pontos exatos de alteração — sempre dentro do bloco `if (billing_mode === 'pack')`:

- **`storefront-create-order` / `place-method-license-order` / `place-reseller-order` / `reseller-api`:**
  1. Lê `delivery_source` do revendedor.
  2. Se `pack`: tenta debitar 1 crédito do `reseller_pack_balances` via RPC atômico.
     - Sucesso → entrega licença, registra em `reseller_pack_ledger` (`kind = 'sale_consume'`), **não toca na carteira**.
     - Falha por `no_credits` → **fallback automático**: debita do saldo da carteira pelo custo da tabela de preços (lógica idêntica à do modo `wallet` hoje), entrega licença, registra transação com `fallback_from_pack = true`.
  3. Se `wallet`: fluxo atual de débito da carteira (sem mudança).
- Cliente final **nunca** vê referência a pacote. Mensagens visíveis seguem as atuais ("Sua licença está sendo gerada…").

### 3. Frontend revendedor

- **`RevendedorDashboard`** (só revendedores Pack):
  - Card grande e bem visível: **"Modo de venda ativo"** com pill `🟢 Saldo da Carteira` ou `📦 Pacote de Licenças`.
  - Toggle inline para alternar (chama RPC `set_delivery_source`).
  - Indicador de licenças restantes com cor dinâmica (verde/amarelo/vermelho conforme regra C).
  - Bloco "Últimas vendas" mostra duas colunas: vendas via **Pacote** e vendas via **Saldo**, com badge de fallback quando aplicável.
- **`PackLowBalanceBanner`** — ajustar thresholds: amarelo 5–9, vermelho 0–4.
- **`RevendedorMinhasChaves` / `RevendedorPedidos`** — adicionar coluna/badge "Origem" (`Pacote` | `Saldo` | `Saldo (fallback)`).
- **`RevendedorAdicionarSaldo` (carteira)** — transações de fallback aparecem com tag amarela "Fallback automático: pacote esgotado".

### 4. Frontend gerente

- **`GerenteDashboard`** — nova métrica "Vendas com fallback (últimos 30d)" e filtro por origem nas listagens já existentes.
- **`GerenteRevendedorPacote`** — mostra `delivery_source` atual de cada revendedor Pack (read-only para o gerente).
- **`GerenteVendasLoja`** — coluna "Origem" igual à do revendedor.

### 5. Geração manual (`RevendedorGerarChave`)

- Inalterada. Continua consumindo só de pacote, e quando `credits = 0` mostra o erro atual "Sem licenças disponíveis. Compre um pacote."
- Texto auxiliar atualizado: "A geração manual sempre consome do seu pacote, independente do modo de venda."

---

## Responsividade (mobile-first)

- **Card "Modo de venda ativo"** no dashboard:
  - Mobile (<640px): stack vertical — título, pill grande centralizada, toggle full-width abaixo, contador de licenças em linha separada.
  - Tablet (≥768px): pill + toggle lado a lado, contador à direita.
  - Desktop (≥1280px): card horizontal compacto ocupando coluna do grid existente.
- **Badges de origem (Pacote/Saldo/Fallback)**: ícone-only no mobile com tooltip, ícone+label no desktop.
- **Toggle**: alvo de toque ≥ 44px no mobile (Switch do shadcn já atende).
- **Banner de licenças baixas**: já é responsivo, só troca cores conforme nova regra.
- Testar nos breakpoints já usados no projeto: 375 / 768 / 1280.

---

## O que NÃO muda (garantia de não-regressão)

- Mensalistas: zero alterações.
- Geração manual de chave: zero alterações.
- Compra de pacote: zero alterações.
- Carteira, recargas, MisticPay: zero alterações fora do ponto de débito da venda.
- API pública: mesmos endpoints, mesmos contratos. Só muda internamente de onde sai a licença.

---

## Ordem de entrega (fases testáveis)

1. **Fase 1 — Schema + backend:** migration + ajuste das 4 edge functions de venda com a lógica `pack → fallback → wallet`. Testar via API e Loja com revendedor de teste.
2. **Fase 2 — Toggle e dashboard do revendedor:** card "Modo de venda ativo", banner com novas cores, badge de origem.
3. **Fase 3 — Visibilidade no gerente:** coluna origem em Vendas Loja, métrica de fallback no dashboard do gerente.
4. **Fase 4 — Polimento:** tooltips, copy final, QA mobile nos 3 breakpoints.

Posso começar pela Fase 1?
