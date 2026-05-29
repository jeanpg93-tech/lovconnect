# Plano Final — Revendedor Mensalista

Novo modo de cobrança aplicável a revendedores específicos (1 inicialmente, modelado para reuso). Tudo **100% responsivo** (mobile-first), reaproveitando padrões já usados no painel.

---

## Visão geral

**Para o gerente:**
- Toggle "Modo Mensalista" no perfil do revendedor.
- Aba "Mensalidade" com: nova cobrança avulsa, recorrência programada (dia 1–28), lista de cobranças (pendente/paga/vencida/cancelada) com PIX/QR, cancelar, marcar pago manual.
- Badge roxo "Mensalista" no card em `GerenteRevendedores`.
- Vendas do mensalista no dashboard com badge/cor distinta + filtro "Tipo".
- Telegram do gerente recebe 🟣 "Venda Mensalista" (flag `notify_subscription_sales`). Revendedor não recebe Telegram/WhatsApp adicional.
- Financeiro Geral ganha categoria "Mensalidades" com KPIs MRR/recebido/em aberto/vencido, filtros, gráficos separados e export CSV com coluna "Tipo".

**Para o revendedor mensalista:**
- **Onboarding bloqueado com blur** no primeiro acesso (similar a revendedor novo). Card central mostra as 2 parcelas iniciais (R$ 250 + R$ 250 dia 3) e botão "Gerar PIX da 1ª parcela". Ao confirmar pagamento via webhook → painel desbloqueia automaticamente. A 2ª parcela vira cobrança pendente normal (banner amarelo).
- Sidebar **sem** "Adicionar Saldo / Comprar Créditos / Precificação > Recargas". Aparecem: **Gerar Chave**, **Minhas Chaves**, **Minhas Cobranças**.
- **Gerar Chave**: usa automaticamente o método ativo do sistema (sem seletor). Só escolhe tipo de licença (teste/1d/7d/15d/30d/vitalícia), nome e WhatsApp do cliente. Sem custo, sem débito de saldo, sem promoção/desconto.
- **Minhas Chaves**: lista das chaves geradas com revogar, resetar device, copiar, histórico.
- **Minhas Cobranças**: pendentes/pagas/vencidas com PIX/QR/copia-cola. Banner amarelo ≤5 dias do vencimento, vermelho se vencido.
- Notificações só no **sino + banner no painel** (sem Telegram/WhatsApp pra ele).
- Se vencer e passar 00:00 BRT do dia seguinte → painel bloqueia (`/painel/cobranca-pendente`). Webhook do pagamento desbloqueia em tempo real.
- Sem promoções/descontos do sistema. Valor cobrado é exato.

---

## Regras de negócio confirmadas

- Bloqueio: **00:00 BRT** do dia seguinte ao vencimento.
- Recorrência: dia 1–28 (para "fim de mês", usar 28).
- Sem `reseller_balances`, sem recarga, sem compra de crédito. Mensalidade cobre todas as chaves.
- Pula `compute_promotion_discount` e `compute_recharge_bonus`.
- Tipos de cobrança: mensalidade recorrente, parcela pontual, taxa avulsa.
- Venda do mensalista entra no histórico com custo = 0, mas continua gravada.

---

## Detalhes técnicos

### Schema

```sql
ALTER TABLE public.resellers
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'normal'
    CHECK (billing_mode IN ('normal','subscription')),
  ADD COLUMN subscription_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN subscription_blocked_at timestamptz,
  ADD COLUMN subscription_onboarding_completed boolean NOT NULL DEFAULT false;

CREATE TABLE public.reseller_subscription_charges (
  id uuid PK, reseller_id uuid FK,
  kind text CHECK (kind IN ('monthly','installment','one_off')),
  description text, amount_cents bigint,
  due_date date, status text CHECK (status IN ('pending','paid','overdue','cancelled')),
  provider text DEFAULT 'misticpay', provider_charge_id text,
  pix_payload text, pix_qr_base64 text,
  paid_at timestamptz, cancelled_at timestamptz,
  recurrence_id uuid, created_by uuid,
  is_onboarding boolean DEFAULT false,
  ...timestamps
);

CREATE TABLE public.reseller_subscription_recurrences (
  id uuid PK, reseller_id uuid,
  amount_cents bigint, day_of_month int CHECK (BETWEEN 1 AND 28),
  description text, warning_days_before int DEFAULT 5,
  is_active boolean DEFAULT true, next_generation_date date,
  ...timestamps
);
```

GRANT + RLS: gerente full CRUD (`has_role('gerente')`); revendedor só `SELECT` das próprias cobranças (`reseller_id IN (SELECT id FROM resellers WHERE user_id = auth.uid())`); `service_role` ALL.

### Edge functions
- `subscription-create-charge` — cria cobrança + PIX MisticPay.
- `subscription-cancel-charge`.
- `subscription-onboarding-pix` — gera PIX da 1ª/2ª parcela inicial.
- `subscription-cron-tick` (pg_cron 00:05 BRT): gera recorrências, marca overdue, atualiza `subscription_blocked`.
- `misticpay-webhook` (existente): handler novo para `reference_kind='subscription_charge'` → marca paga, completa onboarding, desbloqueia, cria lançamento financeiro.
- `place-method-license-order`, `reseller-api`, gerador manual: branch `billing_mode='subscription'` → pula débito e promoções.
- `telegram-dispatch`: branch venda mensalista → só gerente, 🟣 "Venda Mensalista".

### Frontend
- `useRole` expõe `billing_mode`, `subscription_blocked`, `subscription_onboarding_completed`.
- `AppLayout`: novo `<SubscriptionLockOverlay>` (blur + card de PIX) quando onboarding pendente; redirect para `/painel/cobranca-pendente` quando `subscription_blocked=true`.
- `AppSidebar` + `MobileNav`: condicional por `billing_mode`.
- Páginas novas (todas com layout responsivo — grid colapsando para 1 coluna em <768px, tabelas viram cards no mobile, dialogs ocupam tela cheia em mobile):
  - `painel/RevendedorGerarChave.tsx`
  - `painel/RevendedorMinhasChaves.tsx`
  - `painel/RevendedorCobrancas.tsx`
  - `painel/CobrancaPendente.tsx`
  - `painel/GerenteRevendedorMensalidade.tsx` (aba)
- Componentes: `subscription/OnboardingPixCard.tsx`, `NewChargeDialog.tsx`, `RecurrenceDialog.tsx`, `ChargesTable.tsx` (responsivo: tabela em desktop, cards em mobile), `SubscriptionLockOverlay.tsx`, `SubscriptionDueBanner.tsx`.
- Tokens semânticos (`--primary`, `--accent` etc.) e HSL conforme design system. Badge "Mensalista" com cor própria já registrada em `index.css`/`tailwind.config.ts`.

### Responsividade (regra geral aplicada em todas as telas)
- Breakpoints `sm:`/`md:`/`lg:` consistentes com o resto do painel.
- Tabelas: viram lista de cards verticais < `md`.
- Dialogs: `max-w-full` + `h-[100dvh]` < `sm`, padding seguro com `env(safe-area-inset-*)`.
- QR Code do PIX: tamanho fluido (`w-full max-w-[280px] aspect-square mx-auto`).
- Botões de ação: empilham no mobile (`flex-col sm:flex-row`).
- Sidebar continua usando `MobileNav` já existente.

---

## Fases de implementação (entregáveis incrementais)

### Fase 1 — Fundação
- Migration (schema + RLS + grants).
- `useRole`/`useAuth` expõem novos campos.
- Branch `billing_mode='subscription'` em `place-method-license-order` / `reseller-api` / gerador manual: pula débito **e** promoções.
- Sidebar (desktop + mobile) esconde Adicionar Saldo / Comprar Créditos / Precificação>Recargas para mensalista.
- **Entregável**: marca revendedor como mensalista, gera chave sem débito/desconto.

### Fase 2 — Páginas do mensalista (gerar / listar / gerenciar chaves) ✅
- `RevendedorGerarChave` (método ativo automático; tipo + nome + WhatsApp; envio WhatsApp opcional).
- `RevendedorMinhasChaves` (tabela responsiva → cards no mobile; copiar, revogar, resetar device, histórico).
- Sidebar substitui Pedidos/Saldo por Gerar Chave + Minhas Chaves.
- **Entregável**: ele gera, lista, revoga e reseta chaves sozinho.

### Fase 3 — Cobrança avulsa + PIX MisticPay (gerente) ✅
- Toggle "Modo Mensalista" no perfil + aba "Mensalidade".
- `NewChargeDialog` (tipo, valor, vencimento, descrição).
- `subscription-create-charge` gera PIX MisticPay.
- Webhook marca paga + cria lançamento financeiro.
- `ChargesTable` (cancelar, copiar PIX, marcar pago manual).
- **Entregável**: você cria e cobra as duas parcelas iniciais de R$ 250 do revendedor real.

### Fase 4 — Onboarding bloqueado + Minhas Cobranças ✅
- `SubscriptionLockOverlay` (blur + `OnboardingPixCard` com botão "Gerar PIX da 1ª parcela R$ 250" e prévia da 2ª).
- Webhook completa onboarding e desbloqueia automaticamente.
- `RevendedorCobrancas` (Minhas Cobranças) responsiva com QR/copia-cola.
- Banner amarelo (≤5 dias) / vermelho (vencido) no topo do painel.
- Notificação no sino: ao gerar cobrança e 5 dias antes do vencimento.
- **Entregável**: revendedor entra, paga 1ª parcela, painel libera; depois paga 2ª pela aba.

### Fase 5 — Bloqueio automático + cron ✅
- `SubscriptionLockOverlay` em modo `blocked` cobre o painel quando `subscription_blocked=true` (lista cobranças vencidas/pendentes com PIX/QR/copia-cola).
- `AppLayout` aplica o overlay + `inert` quando bloqueado.
- `subscription-cron-tick` (pg_cron 00:05 BRT / 03:05 UTC via pg_net): marca overdue, bloqueia mensalistas com overdue, desbloqueia quem não tem mais overdue.
- Webhook MisticPay continua desbloqueando em tempo real ao confirmar pagamento (já feito na Fase 3).
- **Entregável**: vencimento bloqueia painel sozinho; pagamento libera.

### Fase 6 — Recorrência configurável
- `RecurrenceDialog` (valor, dia 1–28, descrição, aviso N dias antes).
- Cron gera cobranças mensalmente.
- Lista/edição/pausa de recorrências.
- **Entregável**: programa "dia 3, R$ 500" e esquece.

### Fase 7 — Dashboard + Telegram + Financeiro reformulado (gerente)
- Badge roxo "Mensalista" no card de `GerenteRevendedores`.
- Vendas do mensalista no `GerenteDashboard` com badge/cor distinta + filtro "Tipo".
- `telegram-dispatch` 🟣 "Venda Mensalista" só pro gerente (flag `notify_subscription_sales`).
- `GerenteFinanceiroGeral`: categoria "Mensalidades", KPIs MRR/recebido/em aberto/vencido, filtros (revendedor/tipo/status/período), gráficos separados normal vs mensalista, export CSV com coluna "Tipo".
- **Entregável**: acompanha vendas em tempo real e bate o caixa do mês com os dois fluxos separados.

---

## Fora do escopo desta v1

- Boleto/cartão (só PIX).
- Multa/juros automáticos por atraso.
- Revendedor antecipar pagamentos por conta própria (só vê e paga o que você gerou/programou).

---

Confirma que posso começar pela **Fase 1 (migration + fundação)**?
