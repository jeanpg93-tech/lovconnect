# Plano de Backup Total para Migração ao Base44

Objetivo: gerar um pacote completo e autocontido com **TUDO** do projeto atual (código + banco + edge functions + storage + segredos + configurações), de forma que possa ser reconstruído em outra plataforma (Base44) sem perda.

> Importante: o Base44 é uma plataforma low-code/no-code com modelo próprio (entidades, regras, integrações). O backup que vamos gerar é **agnóstico de plataforma** (SQL + JSON + arquivos). A reimplementação dentro do Base44 será uma segunda fase — o backup garante que NADA se perca.

---

## Fase 1 — Backup do Código-Fonte (frontend + extensão)

Empacotar em `backup/codigo/`:
- Todo o `src/` (React + hooks + páginas + componentes)
- `extension/` (extensão do Chrome)
- `public/`, `index.html`, configs (`vite.config.ts`, `tailwind.config.ts`, `tsconfig*.json`, `package.json`, `components.json`, `eslint.config.js`, `postcss.config.js`)
- `supabase/config.toml`
- `.lovable/plan.md`, `README.md`
- Saída: `backup/codigo.zip`

## Fase 2 — Backup do Banco de Dados (Lovable Cloud / Supabase)

Gerar em `backup/db/`:
1. **Schema completo** (`schema.sql`) — todas as tabelas, enums, índices, triggers, foreign keys, RLS policies, GRANTs.
2. **Funções e Procedures** (`functions.sql`) — todas as ~80+ funções `public.*` (has_role, debit/credit balance, telegram_*, notify_*, etc).
3. **Dados** (`data/*.csv` ou `data.sql`) — dump completo de cada uma das ~80 tabelas listadas (resellers, profiles, balance_transactions, orders, storefront_orders, recharge_plans, reseller_credit_purchases, telegram_outbox, app_settings, etc).
4. **Migrações históricas** — copiar `supabase/migrations/` inteiro.
5. **Roles e enums** (`enums.sql`) — `app_role`, e quaisquer outros tipos custom.

## Fase 3 — Backup das Edge Functions

Em `backup/edge-functions/`:
- Copiar TODO o conteúdo de `supabase/functions/` (todas as ~50+ funções: misticpay-webhook, lovax-api, provider-api, recharge-plan-*, telegram-*, system-whatsapp-*, subscription-create-charge, etc.)
- Incluir `config.toml` para preservar flags `verify_jwt`.
- Documento `README.md` listando cada função, sua rota, e secrets necessários.

## Fase 4 — Backup do Storage (buckets)

Em `backup/storage/`:
- Listar todos os buckets ativos (extensões personalizadas, mídias de tutorial de recarga, comprovantes de ativação, QR codes, anexos de testemunhos, etc.).
- Baixar todos os arquivos preservando estrutura `bucket/path/file`.
- Gerar `manifest.json` com metadados (tamanho, mime, owner, created_at, públicos vs privados, policies).

## Fase 5 — Backup de Segredos e Integrações

Em `backup/secrets/secrets-inventory.md` (apenas **nomes** dos secrets, NUNCA os valores):
- `MISTICPAY_CLIENT_ID/SECRET`, `LOVAX_API_TOKEN`, tokens do Telegram, WhatsApp Evolution, OpenAI/Lovable AI, Resend, etc.
- Listar provedores OAuth configurados (Google) e seus redirect URLs.
- Listar webhooks externos apontando para o projeto (MisticPay, Telegram, WhatsApp, provedor de créditos).

Você precisará reexportar/regerar manualmente os valores dos secrets antes de subir no Base44 (por segurança, não saem em backup automático).

## Fase 6 — Backup de Configurações de Auth

Em `backup/auth/`:
- Lista de providers ativos, redirect URLs, site URL.
- Templates de email customizados (se houver).
- Configurações de senha, sessão, JWT expiry.
- Lista completa de usuários (`auth.users`) exportada via admin API: id, email, created_at, last_sign_in, providers — **sem** hash de senha (não exportável). Usuários precisarão redefinir senha no Base44 OU migrar via OAuth.

## Fase 7 — Documentação de Domínio

Em `backup/docs/`:
- `arquitetura.md` — visão geral: papéis (gerente/revendedor/cliente), fluxos (loja pública, recarga PIX, planos, packs, API de revendedor, extensão Chrome).
- `regras-de-negocio.md` — pricing por tier, comissões de afiliado, débito de saldo vs pack, fallback, refunds, promoções.
- `integracoes.md` — MisticPay (PIX), LovaX (entrega de créditos), Telegram (notificações), WhatsApp Evolution, provedor de créditos Lovable.
- `cron-jobs.md` — schedules ativos (`apply-recharge-schedule`, `recharge-plan-cron`, `expire-pending-storefront-orders`, etc.).
- `dominios.md` — `lovconnect.store`, `www.lovconnect.store`, configuração DNS.

## Fase 8 — Empacotamento Final

Gerar `lovconnect-backup-YYYYMMDD.zip` contendo:
```
backup/
├── codigo/
├── db/
├── edge-functions/
├── storage/
├── secrets/
├── auth/
├── docs/
└── README.md  ← índice geral + instruções de restauração
```
Disponibilizar em `/mnt/documents/` para download.

---

## Pontos para você decidir antes de eu executar

1. **Dados sensíveis**: incluir TODA a tabela `balance_transactions`, `orders`, `profiles` (com emails de clientes finais)? Ou anonimizar?
2. **Storage**: alguns buckets podem ter MUITOS arquivos (mídias de extensão personalizada por revendedor). Baixar tudo, ou só estrutura + URLs?
3. **Histórico Telegram/WhatsApp**: incluir `telegram_outbox`, `system_whatsapp_log` (podem ser pesados e descartáveis)?
4. **Formato preferido do dump SQL**: um único `.sql` gigante (mais fácil de restaurar) ou separado por tabela (mais fácil de inspecionar)?
5. Quer que eu já comece pela **Fase 1 + Fase 2** (código + banco), que são as mais críticas, e depois sigo as outras?

Confirme as respostas e eu executo o backup completo.
