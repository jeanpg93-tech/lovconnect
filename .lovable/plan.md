
## Bot do Telegram — notificações + comandos

### 1. Banco de dados (1 migração)

**Tabela `telegram_settings`** — singleton com config do gerente:
- `chat_id` (bigint) — preenchido quando você pareia o bot
- `pairing_code` (text) — código de 6 dígitos pra você enviar ao bot
- Toggles: `notify_sales`, `notify_recharges`, `notify_signups`, `notify_refunds`, `notify_reseller_activity` (todos `true` por padrão)

**Tabela `telegram_outbox`** — fila de mensagens a enviar (id, text, created_at, sent_at, error). Garante que nada se perde se o Telegram falhar.

**Triggers que enfileiram mensagens automaticamente:**
- `profiles` INSERT com `approval_status='pending'` → "🆕 Novo cadastro aguardando aprovação"
- `balance_transactions` INSERT → roteia por `kind`:
  - `deposit` → "💰 Recarga de saldo do revendedor X"
  - `order_debit` → "🛒 Nova venda na loja do revendedor X"
  - `refund` / `estorno` → "↩️ Reembolso processado"
  - outros (manual_debit, manual_credit) → "⚙️ Movimentação do revendedor X"

### 2. Edge functions (3 novas)

**`telegram-webhook`** (`verify_jwt = false`) — recebe mensagens do Telegram:
- `/start <código>` — pareia seu chat_id com a conta de gerente
- `/saldo` — saldo total dos revendedores e movimentações do dia
- `/vendas` — vendas pagas hoje (qtd + total)
- `/recargas` — recargas hoje
- `/pendentes` — cadastros aguardando aprovação
- `/help` — lista de comandos
- Segurança: só responde ao `chat_id` pareado

**`telegram-dispatch`** — processa o outbox, envia via gateway. Chamado por cron a cada 1min.

**`telegram-notify`** (helper interno) — pode ser chamada por outras edge functions pra avisos pontuais (erros críticos etc).

### 3. Cron job (pg_cron + pg_net)
Roda `telegram-dispatch` a cada minuto pra esvaziar o outbox.

### 4. UI — nova página `/painel/gerente/telegram`
- Status do bot (pareado ✅ ou aguardando)
- Botão "Gerar código de pareamento" + instruções (procurar o bot @SeuBot, mandar `/start CODIGO`)
- Toggles pra ativar/desativar cada tipo de notificação
- Link rápido pra abrir o chat com o bot

### Detalhes técnicos
- Webhook do Telegram registrado via gateway depois do deploy
- Secret derivado de `TELEGRAM_API_KEY` (não pede token bruto)
- Outbox + dispatcher evita timeout: triggers do banco não bloqueiam esperando o Telegram responder
- Comandos usam `service_role` na função pra ler agregados sem RLS

### O que NÃO entra nesta versão
- Notificações por revendedor (cada um com seu próprio chat) — você confirmou que só o gerente recebe
- Inline keyboards / botões interativos — só comandos de texto por enquanto

Confirma que tá ok que eu implemento?
