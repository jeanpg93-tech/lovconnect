# Toggle manual de vendas (mensalista / pack)

## Objetivo
Permitir que o gerente desligue/ligue manualmente as vendas de um revendedor mensalista ou pack, com status visual (bolinha verde/vermelha) tanto para o gerente quanto para o revendedor, e bloqueio com mensagem clara quando desativado.

---

## 1. Backend (1 migration)

Adicionar 2 colunas em `resellers`:
- `subscription_sales_disabled boolean not null default false`
- `pack_sales_disabled boolean not null default false`

Sem mudança em RLS (a tabela já permite o gerente atualizar via policies existentes).

## 2. Hook `useRole`

Expor as 2 novas flags no snapshot e no retorno (`subscriptionSalesDisabled`, `packSalesDisabled`), persistir em localStorage como as outras, e derivar:
- `subscriptionBlocked` final = `subscription_blocked || subscription_sales_disabled`
- `packBlocked` final = `(billingMode === "pack" && packCredits <= 0) || pack_sales_disabled`

Adicionar também `salesDisabledByManager: boolean` para que os overlays e o dashboard saibam diferenciar bloqueio automático vs. manual e escolher a mensagem certa.

## 3. Telas do gerente

### `/painel/gerente/revendedores/:id/mensalidade`
- Carregar também `subscription_sales_disabled` no `select` de reseller.
- Novo card no topo (próximo ao seletor de modo de cobrança):
  - **Status atual** com bolinha + texto:
    - Verde → "Vendas habilitadas — sistema on-line"
    - Vermelha → "Vendas suspensas pelo gerente"
  - Botão `Desativar vendas` / `Ativar vendas` (com confirmação via `AlertDialog` quando for desativar).
- Salva via `UPDATE resellers SET subscription_sales_disabled = ...`.

### `/painel/gerente/revendedores/:id/pacote`
- Igual ao acima, usando `pack_sales_disabled`.

## 4. Tela do revendedor — bloqueio

### Mensalista
- `AppLayout` já mostra `SubscriptionLockOverlay mode="blocked"` quando `subscriptionBlocked` é true. Com a derivação nova, vai disparar também quando o gerente desativar.
- `SubscriptionLockOverlay` recebe nova prop opcional `reason: "overdue" | "manager"`. Quando `manager`:
  - Título: "Vendas suspensas"
  - Texto: "Vendas suspensas pelo gerente. Entre em contato para mais informações."
  - Esconde a parte de cobranças/PIX (não faz sentido).
  - Mantém botão "Verificar novamente" e "Sair".
- `AppLayout` passa `reason="manager"` quando `salesDisabledByManager` for true.

### Pack
- Hoje pack não bloqueia o painel inteiro (comentário explícito no `AppLayout`). Manter esse comportamento para o caso "créditos = 0".
- Quando `pack_sales_disabled` for true, **também não bloquear o painel** (consistente com o pack atual) — mas bloquear as ações de venda do mesmo jeito que zero créditos já bloqueia (botões "Gerar chave" / fluxos de pack ficam desabilitados ou redirecionam). A mensagem aparece no Dashboard (próximo passo).

## 5. Status visual no Dashboard do revendedor

Novo componente `SalesStatusBadge` exibido no topo do `RevendedorDashboard`:
- **Mensalista ativo / Pack ativo (com créditos):** bolinha verde pulsante + "Sistema on-line — vendas liberadas".
- **Mensalista desativado pelo gerente:** bolinha vermelha + "Vendas suspensas pelo gerente. Entre em contato para mais informações."
- **Pack desativado pelo gerente:** mesma mensagem do mensalista, bolinha vermelha.
- **Pack com créditos = 0 (automático):** bolinha vermelha + "Suas licenças acabaram. Compre um novo pacote para continuar vendendo." (sem mencionar gerente).
- **Mensalista com cobrança em aberto (automático):** já tratado pelo overlay, mas mostra também badge vermelha "Cobrança em aberto" para consistência.

Componente é renderizado de forma compacta logo abaixo do `PageHeader`.

## 6. Status visual nas telas do gerente

Reutilizar o `SalesStatusBadge` (versão sem heurística de pack-zero, já que o gerente já vê o saldo separadamente) nas páginas `mensalidade` e `pacote` do gerente, ao lado do botão ativar/desativar — mostra o estado atual daquele revendedor específico.

---

## Detalhes técnicos

**Arquivos novos:**
- `src/components/painel/SalesStatusBadge.tsx`

**Arquivos modificados:**
- `supabase/migrations/<timestamp>_reseller_sales_toggle.sql` (nova migration)
- `src/hooks/useRole.tsx` — novos campos + derivação
- `src/components/subscription/SubscriptionLockOverlay.tsx` — prop `reason`
- `src/components/layout/AppLayout.tsx` — passar `reason` correta
- `src/pages/painel/GerenteRevendedorMensalidade.tsx` — toggle + badge
- `src/pages/painel/GerenteRevendedorPacote.tsx` — toggle + badge
- `src/pages/painel/RevendedorDashboard.tsx` — render do badge no topo
- `src/integrations/supabase/types.ts` — atualizado automaticamente pela migration

**Realtime:** o `useRole` já refaz fetch quando o user muda; o overlay já escuta `UPDATE` em `resellers` e dá reload. Vamos garantir que o reload também ocorra quando `subscription_sales_disabled` mudar (basta remover o filtro restritivo no payload do overlay — já é um listener genérico em UPDATE, só ajustar condição de reload).
