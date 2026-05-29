
# Plano — Revendedor Mensalista

Criar um novo modo de cobrança ("mensalista") aplicável a revendedores específicos. Por enquanto será usado para 1 revendedor, mas já fica modelado para reutilizar no futuro sem refazer nada.

## Como vai funcionar (visão do usuário)

**Para você (gerente):**
- Novo card no perfil do revendedor com a flag **"Modo: Mensalista"** (toggle).
- Ao ativar, abre uma área nova: **Cobranças do Mensalista** com:
  - Botão **"Nova cobrança"** → escolhe tipo (Mensalidade, Parcela, Taxa avulsa), valor, data de vencimento e descrição. Gera PIX automaticamente via MisticPay.
  - Botão **"Programar recorrência"** → ex: "Todo dia 3, R$ 500, com avisos 5 dias antes". O sistema cria as cobranças sozinho mês a mês.
  - Lista de cobranças (pendente / paga / vencida / cancelada) com link do PIX, QR Code, data de pagamento, ações (cancelar, reenviar, marcar pago manual em caso de exceção).
- Caso 1ª mensalidade parcelada (R$ 250 hoje + R$ 250 dia 3): você cria duas cobranças avulsas e depois ativa a recorrência mensal a partir do mês seguinte.

**Para o revendedor mensalista:**
- Aba **Recargas / Adicionar Saldo** fica oculta (ou exibe aviso "indisponível no seu plano").
- Licenças são geradas **sem custo de saldo** (mensalidade cobre tudo) — nenhum débito em `reseller_balances`.
- Nova aba **"Minhas Cobranças"** mostra pendências, vencidas e histórico, com QR/copia-cola do PIX.
- Banner no topo do painel quando faltar ≤ 5 dias para vencer; banner vermelho quando vencido.
- Se vencer e não pagar até as 00:00 do dia seguinte ao vencimento (BRT) → painel entra em estado **bloqueado**: redirect para `/cobranca-pendente` mostrando o(s) PIX em aberto. Não consegue gerar licença, acessar API, nada além de pagar.
- Pagamento confirmado via webhook MisticPay → desbloqueia automaticamente.

## O que muda no banco

Resumo em português (detalhes técnicos na próxima seção):
- Nova flag por revendedor: modo de cobrança ("normal" ou "mensalista").
- Nova tabela de **cobranças do mensalista** (valor, vencimento, status, link PIX).
- Nova tabela de **recorrências** (regra "todo dia X do mês, valor Y").
- Job diário que: (a) gera cobranças da recorrência, (b) marca vencidas, (c) bloqueia o painel automaticamente.

## Onde aparece no painel

- **Gerente** → página do revendedor (`GerenteRevendedores`) ganha uma aba/seção **"Mensalidade"** (só aparece quando o modo está ativo). Toggle de ativação fica no topo do perfil.
- **Revendedor mensalista** → nova entrada na sidebar **"Minhas Cobranças"** substituindo "Adicionar Saldo". Aba **Recargas/Precificação > Recargas** some.

## Detalhes técnicos

### Schema (migration)

```sql
-- 1. Flag no revendedor
ALTER TABLE public.resellers
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'normal'
  CHECK (billing_mode IN ('normal','subscription'));

-- 2. Cobranças
CREATE TABLE public.reseller_subscription_charges (
  id uuid PK,
  reseller_id uuid NOT NULL REFERENCES resellers,
  kind text CHECK (kind IN ('monthly','installment','one_off')),
  description text,
  amount_cents bigint NOT NULL,
  due_date date NOT NULL,
  status text CHECK (status IN ('pending','paid','overdue','cancelled')) DEFAULT 'pending',
  provider text DEFAULT 'misticpay',
  provider_charge_id text,
  pix_payload text,        -- copia-cola
  pix_qr_base64 text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  recurrence_id uuid,      -- FK opcional para origem
  created_by uuid,
  created_at/updated_at
);

-- 3. Recorrências
CREATE TABLE public.reseller_subscription_recurrences (
  id uuid PK,
  reseller_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 28),
  description text,
  warning_days_before int DEFAULT 5,
  is_active boolean DEFAULT true,
  next_generation_date date,
  created_at/updated_at
);

-- 4. Estado de bloqueio (campo derivado, mas materializado pra performance)
ALTER TABLE public.resellers
  ADD COLUMN subscription_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN subscription_blocked_at timestamptz;
```

GRANT + RLS:
- Gerente: full CRUD nas duas tabelas via policies `has_role(... 'gerente')`.
- Revendedor: `SELECT` apenas das próprias cobranças (`reseller_id = (SELECT id FROM resellers WHERE user_id = auth.uid())`).
- `service_role`: ALL (edge functions).

### Edge functions novas
- `subscription-create-charge` → cria cobrança + gera PIX MisticPay.
- `subscription-cron-tick` (cron diário 00:05 BRT via pg_cron + pg_net):
  1. Gera cobranças das recorrências cuja `next_generation_date <= hoje`.
  2. Marca `pending` com `due_date < hoje` como `overdue`.
  3. Para cada revendedor mensalista com alguma `overdue`, set `subscription_blocked = true`.
  4. Para cada revendedor sem nenhuma overdue, set `subscription_blocked = false`.
- `subscription-cancel-charge`.
- Webhook MisticPay existente (`misticpay-webhook`) — adicionar handler: quando `reference_kind = 'subscription_charge'`, marca cobrança como `paid` e re-roda passo 3/4 daquele revendedor.

### Bloqueio no frontend
- `useAuth`/`useRole` já carregam o reseller — adicionar `subscription_blocked` e `billing_mode` ao retorno.
- `AppLayout`: se `subscription_blocked` → redirect forçado para `/painel/cobranca-pendente` (exceto rotas de logout).
- Sidebar (`AppSidebar`/`MobileNav`): se `billing_mode='subscription'` → esconder "Adicionar Saldo", "Precificação > Recargas", "Comprar Créditos"; adicionar "Minhas Cobranças".
- Lançamento de licença (`place-method-license-order`, `reseller-api`): se `billing_mode='subscription'` → pular débito de saldo (custo = 0, mas continua registrando a venda para histórico).

### Páginas/Componentes novos
- `src/pages/painel/GerenteRevendedorMensalidade.tsx` (aba dentro de `GerenteRevendedores`).
- `src/pages/painel/RevendedorCobrancas.tsx` (lista pra ele).
- `src/pages/painel/CobrancaPendente.tsx` (tela de bloqueio).
- `src/components/painel/subscription/NewChargeDialog.tsx`, `RecurrenceDialog.tsx`, `ChargesTable.tsx`.

### Avisos no painel do revendedor
- Hook `useSubscriptionStatus` busca a próxima cobrança pendente.
- Banner: amarelo se `due_date - hoje <= warning_days_before`, vermelho se `overdue`.
- Notificação (`notifications` table) criada pelo cron 5 dias antes do vencimento.

## O que NÃO está incluso (deixar pra depois se precisar)

- Boleto/cartão (só PIX nesta v1).
- Multa/juros automáticos por atraso.
- Relatório financeiro consolidado das mensalidades (entra no Financeiro Geral em iteração 2).
- Painel do próprio revendedor para "antecipar pagamentos" — só vê e paga o que você gerou.

## Ordem de implementação sugerida

1. Migration (schema + RLS + grants).
2. Toggle de modo + ocultar recargas/saldo na UI do revendedor.
3. Tela do gerente: criar cobrança avulsa + integração PIX MisticPay.
4. Webhook → marca paga.
5. Tela "Minhas Cobranças" do revendedor + banner de aviso.
6. Cron diário (geração de recorrências + overdue + bloqueio).
7. Tela de bloqueio + redirect.
8. Recorrência configurável no painel do gerente.

Cada etapa é entregável independente — dá pra testar com o revendedor real já na etapa 4.

---

## Decisões confirmadas

- **Bloqueio**: 00:00 BRT do dia seguinte ao vencimento.
- **Recorrência**: só dia 1–28 (pra "fim de mês", usa dia 28).
- **Avisos de vencimento**: só sino + banner no painel (sem WhatsApp/Telegram pro revendedor).
- **Telegram de vendas do mensalista**: SOMENTE pro gerente. O revendedor não recebe nada extra.
- **Sem saldo**: mensalista NÃO tem `reseller_balances`, NÃO faz recarga, NÃO compra crédito. A mensalidade cobre todas as chaves emitidas no período.
- **Sem promoções/descontos**: nenhuma promoção do sistema (desconto de licença, bônus de recarga, desconto de créditos) se aplica. Cobrado é o valor exato da mensalidade/taxa — pular `compute_promotion_discount` e `compute_recharge_bonus`.
- **Tipos de cobrança**: (1) Mensalidade recorrente (ex: dia 3 ou 5 todo mês), (2) Taxas avulsas (atualização, manutenção), (3) Parcelas pontuais.

## Extras — vendas do mensalista

O mensalista usa o painel normal pra gerar/gerenciar licenças, mas **sem débito de saldo**.

**No painel dele (igual aos outros, sem custo):**
- Geração manual de licença (`RevendedorPedidos` / gerador manual): produto, duração, dados do cliente, gera a chave — sem débito.
- "Minhas Vendas" lista as chaves geradas.
- Revogar chave, resetar device, histórico — usa endpoints existentes (`reseller-license-action`, `license-reset-device`).
- API revendedor disponível, também sem débito.

**No painel do gerente:**
- Badge roxo **"Mensalista"** no card em `GerenteRevendedores`.
- Vendas do mensalista no dashboard com badge/cor distinta ("Venda Mensalista") + coluna "Tipo".
- Filtro pra ver só vendas de mensalistas.
- Telegram: cada venda dele dispara notificação no bot do gerente (ícone 🟣), reutilizando `telegram-dispatch`, com flag `notify_subscription_sales` na config.

**Onde mexer:**
- `place-method-license-order` / `reseller-api` / gerador manual: pular débito quando `billing_mode='subscription'`, mas continuar gravando a venda (custo = 0) pro histórico funcionar.
- `telegram-dispatch`: branch quando vendedor for mensalista → manda só pro gerente, formato diferenciado.
- `GerenteDashboard` / lista de vendas: badge + filtro.

## Financeiro do gerente — reformulação (entra no plano)

Tudo de mensalista aparece no **Financeiro Geral** (`GerenteFinanceiroGeral`) separado do fluxo normal:

- Nova categoria **"Mensalidades"** com sub-tipos (mensalidade, taxa avulsa, parcela).
- Filtros: por revendedor mensalista, tipo, status (pago/pendente/vencido), período.
- KPIs no topo: **MRR**, recebido no mês de mensalistas, em aberto, vencido.
- Separação visual clara (cor/badge) entre receita normal e receita mensalista — gráficos e tabelas.
- Export CSV com coluna "Tipo".
- Cada cobrança paga vira lançamento automático (origem = `subscription_charge`) com link pra cobrança.

---

## Fases de implementação (entrega incremental)

### Fase 1 — Fundação
- Migration: `billing_mode`, `subscription_blocked`, tabelas `reseller_subscription_charges` + `reseller_subscription_recurrences`, RLS, grants.
- `useRole`/`useAuth` expõem `billing_mode` e `subscription_blocked`.
- `place-method-license-order` / `reseller-api` / gerador manual: branch que pula débito **e promoções** quando `billing_mode='subscription'`.
- Sidebar do mensalista esconde "Adicionar Saldo", "Comprar Créditos", "Precificação > Recargas".
- **Entregável**: marca revendedor como mensalista no banco, ele já gera chave sem débito/desconto.

### Fase 2 — Cobrança avulsa + PIX MisticPay
- Toggle "Modo Mensalista" no perfil do revendedor.
- Aba "Mensalidade" com botão **Nova cobrança** (tipo, valor, vencimento, descrição).
- Edge `subscription-create-charge` → gera PIX MisticPay.
- Webhook MisticPay marca `paid` + cria lançamento no financeiro.
- Tabela de cobranças (cancelar, copiar PIX, marcar pago manual).
- **Entregável**: cobra o revendedor real (as duas parcelas iniciais de R$ 250).

### Fase 3 — Painel do mensalista
- Página **Minhas Cobranças** (pendentes/pagas/vencidas + QR/copia-cola).
- Banner amarelo (≤ 5 dias) / vermelho (vencido).
- Notificação no sino: ao gerar e 5 dias antes do vencimento.
- **Entregável**: ele paga sozinho.

### Fase 4 — Bloqueio automático
- Página `/painel/cobranca-pendente` com PIX em aberto.
- `AppLayout` redireciona quando `subscription_blocked=true`.
- Cron `subscription-cron-tick` (00:05 BRT): marca overdue, bloqueia, desbloqueia.
- Webhook desbloqueia em tempo real ao confirmar pagamento.
- **Entregável**: vencimento bloqueia painel sozinho.

### Fase 5 — Recorrência configurável
- Botão **Programar recorrência** (valor, dia 1–28, descrição, aviso N dias antes).
- Cron gera as cobranças mensalmente.
- Lista/edição/pausa de recorrências.
- **Entregável**: programa "dia 3, R$ 500" e esquece.

### Fase 6 — Dashboard + Telegram do gerente
- Badge "Mensalista" no card em `GerenteRevendedores`.
- Vendas do mensalista no `GerenteDashboard` com badge/cor distinta + filtro "Tipo".
- Telegram do gerente: 🟣 "Venda Mensalista" via `telegram-dispatch`.
- Flag `notify_subscription_sales` em `telegram_settings`.
- **Entregável**: acompanha vendas dele em tempo real.

### Fase 7 — Financeiro reformulado
- Categoria "Mensalidades" no `GerenteFinanceiroGeral`.
- KPIs MRR / recebido / em aberto / vencido.
- Filtros por revendedor, tipo, status, período.
- Gráficos separados normal vs mensalista.
- Export CSV com coluna "Tipo".
- **Entregável**: bate o caixa do mês com os dois fluxos separados.
