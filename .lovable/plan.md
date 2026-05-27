## Objetivo

Transformar `/painel/gerente/acoes-especiais` em uma página **funcional de promoções** que:
1. Realmente aplique os 3 valores (desconto em extensões, desconto em recargas, bônus de recarga) nos fluxos de cobrança.
2. Permita **programar promoções** com início/fim (data e hora), com possibilidade de ativar/desativar na hora ou agendar.

---

## Parte 1 — Modelo de dados

### Nova tabela `promotions`

Colunas principais:
- `id`, `name` (ex.: "Promo Black Friday"), `description`
- `extension_discount_pct` (0–100, nullable)
- `credit_discount_pct` (0–100, nullable) — desconto na compra de pacotes de crédito pelo revendedor
- `recharge_bonus_pct` (0–500, nullable) — bônus extra creditado ao revendedor ao recarregar saldo
- `starts_at` (timestamptz, nullable) — se nulo = começa imediatamente quando ativada
- `ends_at` (timestamptz, nullable) — se nulo = sem data fim
- `status`: `scheduled` | `active` | `paused` | `ended`
- `activated_at`, `deactivated_at`, `created_by`, `created_at`, `updated_at`

Regras:
- Só pode haver **uma promoção ativa por vez** (constraint via índice parcial único em `status='active'`).
- RLS: gerente CRUD; autenticados podem SELECT da promoção ativa (para mostrar banner ao revendedor/loja).
- GRANTs corretos.

### Função RPC `get_active_promotion()`
Retorna a promoção cujo `status='active'` E `now() between coalesce(starts_at, -inf) and coalesce(ends_at, +inf)`. Usada pelas edge functions.

### Tabela `promotion_logs` (auditoria)
Eventos: created, scheduled, activated, deactivated, ended, edited. Já cobre o "Histórico de Alterações" que hoje é placeholder.

### Os 3 campos antigos em `global_settings`
Ficam como **default permanente** (sem promoção). A regra final é:
> custo final = preço base × (1 − desconto_promo_ativa OR desconto_padrão_global)

Se preferir, posso descontinuar os 3 campos do `global_settings` e usar **só** o sistema de promoções (uma "promoção padrão" sempre ativa). Decisão a confirmar.

---

## Parte 2 — Aplicação dos descontos nos fluxos

Identifiquei os pontos onde os valores devem efetivamente entrar:

| Campo | Onde aplicar |
|---|---|
| `extension_discount_pct` | Cobrança de licenças/extensões: `storefront-create-order`, `place-method-license-order`, `place-reseller-order`, `misticpay-webhook` (caminho de licença) |
| `credit_discount_pct` | Compra de pacotes de crédito pelo revendedor: `reseller-credits-api`, `reseller-recharge-api`, `lovable-credits-api`, `misticpay-webhook` (caminho de créditos) |
| `recharge_bonus_pct` | Quando saldo é creditado ao revendedor após recarga PIX confirmada (`misticpay-webhook` → criação de `balance_transactions kind='recharge'`): aplicar bônus extra como transação separada `kind='manual_credit'` com descrição "Bônus promoção X" |

Cada função vai chamar `get_active_promotion()` no momento da cobrança e aplicar o desconto/bônus se houver match. O **snapshot** do valor cobrado e do desconto aplicado fica gravado na linha (em coluna nova `discount_cents` / `bonus_cents` ou no `notes`/`provider_response`) para auditoria.

> ⚠️ Conforme `mem://features/pricing-refactor`, há manutenção programada hoje 00h para refatorar precificação. Esta camada de promoção **encaixa em cima** do `get_credit_pack_cost` unificado que vai existir após a refatoração. Vou implementar de forma compatível com a nova RPC (aplica o `%` em cima do retorno dela).

---

## Parte 3 — UI `/painel/gerente/acoes-especiais`

Reformular a página em 3 blocos:

### Bloco A — Promoção ativa agora
Card grande mostrando:
- Nome, os 3 percentuais
- Janela (início → fim) com countdown
- Botão **"Desativar agora"** (vermelho)

Se não houver, mostra "Nenhuma promoção ativa".

### Bloco B — Programadas / agendadas
Lista das promoções com `status='scheduled'` (data futura) ou pausadas.
- Cada linha: nome, janela, percentuais, ações: **Ativar agora**, **Editar**, **Cancelar**.

### Bloco C — Criar promoção (dialog)
Formulário com:
- Nome + descrição
- 3 inputs de porcentagem (cada um com checkbox "incluir nesta promoção")
- **Quando iniciar?** rádio: `Agora` | `Agendar para…` (datetime-picker)
- **Quando terminar?** rádio: `Sem data fim` | `Em…` (datetime-picker)
- Botão "Salvar e ativar/agendar"

Validação: pelo menos 1 dos 3 campos preenchido; `ends_at > starts_at`.

### Bloco D — Histórico
Tabela vinda de `promotion_logs` (substitui o placeholder atual).

### Defaults permanentes (opcional)
Se decidirmos manter os 3 campos do `global_settings`, eles ficam em uma aba/seção secundária "Descontos padrão sempre ativos". Senão, removo.

---

## Parte 4 — Agendamento automático (cron)

Reusar o padrão já existente (`apply-recharge-schedule` + `pg_cron`):

- Nova edge function **`apply-promotion-schedule`** que roda a cada minuto:
  - Ativa promoções com `status='scheduled'` cujo `starts_at <= now()`.
  - Finaliza (`status='ended'`) promoções com `status='active'` cujo `ends_at <= now()`.
  - Garante regra de unicidade (se ativar uma, encerra outras ativas).
  - Notifica via `telegram_outbox` ("🎉 Promoção X ativada", "⏹️ Promoção X finalizada").
  - Registra em `promotion_logs`.

Cron job criado via `pg_cron` + `pg_net` (mesmo padrão das outras agendas).

---

## Parte 5 — Visibilidade para revendedor (mínimo viável)

Quando houver promoção ativa, mostrar um **banner** no painel do revendedor (`RevendedorDashboard`) e na loja pública (`PublicStorefront`/`PublicRecharge`) tipo:
> "🎉 Promoção ativa: 20% OFF em recargas até dom 18:00"

Lê via `get_active_promotion()` (SELECT permitido a autenticados / anônimo conforme o caso).

---

## Detalhes técnicos

```text
DB
├── tabela promotions (+ índice único parcial em status='active')
├── tabela promotion_logs
├── RPC get_active_promotion()
└── trigger para registrar promotion_logs em INSERT/UPDATE

Edge functions
├── apply-promotion-schedule (cron 1min)
└── alterações em: storefront-create-order, place-method-license-order,
    place-reseller-order, reseller-credits-api, reseller-recharge-api,
    lovable-credits-api, misticpay-webhook

Frontend
├── src/pages/painel/GerenteAcoesEspeciais.tsx (reescrita)
├── src/components/painel/promotions/
│   ├── ActivePromotionCard.tsx
│   ├── ScheduledPromotionsList.tsx
│   ├── CreatePromotionDialog.tsx
│   └── PromotionHistoryTable.tsx
├── src/hooks/usePromotions.ts
└── src/components/painel/ActivePromotionBanner.tsx (revendedor + storefront)
```

---

## Perguntas antes de executar

1. **Os 3 campos atuais de `global_settings`**: descontinuar (todo desconto vira "promoção") ou manter como "desconto padrão permanente" que coexiste com promoções programadas? Recomendo **descontinuar** e migrar os valores atuais para uma promoção "Padrão" sem `ends_at`.
2. **Bônus de recarga**: o bônus extra vira **crédito adicional na carteira** (`balance_transactions`) ou aumenta diretamente o `credits` recebidos no pacote? Recomendo **crédito na carteira** (mais simples e rastreável).
3. **Janela de manutenção 00h (refatoração de pricing)**: posso entregar isso **depois** da refatoração estar validada, certo? Ou quer que eu já entregue agora encaixando provisoriamente em cima da lógica atual?
4. Confirma que **só pode haver 1 promoção ativa por vez**? (Mais simples; senão precisamos definir como combinar 2 promoções concorrentes.)
