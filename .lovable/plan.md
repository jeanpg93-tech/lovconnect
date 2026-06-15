
# Inventário de migração — LovConnect

Dados coletados agora do banco/Storage/Functions para você planejar a migração.

---

## 1 + 2. Tabelas do schema `public` com contagem de linhas

Total: **75 tabelas** (uma a mais do que constava no `MIGRATION.md`). Ordenadas por volume — priorize as do topo na exportação CSV.

### Alto volume (>100 linhas) — exportar primeiro
| # | Tabela | Linhas |
|---|---|---|
| 1 | orders | 1.387 |
| 2 | telegram_outbox | 1.006 |
| 3 | reseller_api_usage | 772 |
| 4 | reseller_pack_ledger | 426 |
| 5 | balance_transactions | 375 |
| 6 | trial_registrations | 330 |
| 7 | reseller_customers | 327 |
| 8 | system_whatsapp_log | 235 |
| 9 | storefront_orders | 172 |

### Médio (10–100)
notifications 71 · recharge_plan_deliveries 60 · manual_financial_entries 53 · reseller_license_prices 49 · reseller_credit_purchases 47 · recharge_intents 39 · tier_credit_prices 36 · activation_logs 34 · affiliate_codes 33 · user_roles 32 · profiles 32 · resellers 31 · reseller_credit_cost_overrides 27 · reseller_credit_prices 26 · tier_license_prices 24 · reseller_api_keys 22 · system_whatsapp_events 21 · refund_requests 17 · user_presence 16 · reseller_balances 16 · reseller_referrals 15 · reseller_pack_purchases 15 · storefront_testimonials 15 · blocked_sale_attempts 13 · app_settings 13 · activation_payments 11 · reseller_storefronts 10

### Baixo (1–9)
credit_pricing_plans 9 · reseller_tier_state 9 · hwid_reset_logs 8 · license_base_costs 6 · reseller_integrations 6 · license_packs 6 · extension_versions 5 · reseller_pack_balances 5 · reseller_tiers 4 · pending_storefront_charges 3 · reseller_recharge_plan_subscriptions 3 · promotion_logs 3 · reseller_recharge_plan_prices 3 · storefront_reports 2 · reseller_extension_price_overrides 2 · reseller_license_cost_overrides 2 · provider_credit_orders 2 · extensions 2 · promotions 2 · reseller_subscription_charges 2 · recharge_plan_tutorial_media 2 · admin_audit_logs 2 · recharge_plans 1 · telegram_settings 1 · recharge_schedule 1 · reseller_api_webhook_deliveries 1 · system_whatsapp_settings 1 · provider_settings 1 · manual_recharge_metadata 1 · global_settings 1

### Vazias (esquema só) — não precisa exportar
reseller_extensions · reseller_api_idempotency · announcement_reads · extension_customizations · direct_sales · client_extensions · partner_price_history · announcements · ranking_prizes · reseller_subscription_recurrences · reseller_extension_prices · tier_extension_prices · telegram_notification_failures

> Observação: o schema é recriado integralmente rodando `supabase/migrations/*.sql` no novo projeto. CSV serve só para os dados.

---

## 3. Buckets de Storage (8)

| Bucket | Público | Observação |
|---|---|---|
| storefront-assets | sim | Imagens das lojas dos revendedores |
| extension-files | não | Builds internos |
| extension-assets | sim | Ícones/logos da extensão |
| extension-builds | não | ZIPs gerados |
| extension-customizations | sim | Imagens personalizadas |
| avatars | sim | Avatares de usuários |
| activation-proofs | não | Comprovantes de pagamento |
| plan-tutorials | não | Mídia dos tutoriais de plano |

Baixe via Lovable Cloud → Storage → cada bucket → download em massa, depois faça re-upload no novo projeto preservando os caminhos.

---

## 4. Edge Functions deployadas (73)

activation-create-pix, activation-review, activation-submit-proof, activation-waive, admin-create-demo-account, admin-create-monthly-reseller, admin-delete-demo-account, apply-promotion-schedule, apply-recharge-schedule, audit-cancelled-purchases, cancel-credit-purchase, cancel-credit-recharge, cancel-sale, cancel-storefront-order, check-misticpay-withdraw, dev-release-storefront-pix, evolution-api, evolution-send-sale, expire-pending-storefront-orders, extension-build-zip, extension-config, generate-testimonials-ai, gerente-estornar-venda, get-my-misticpay-credentials, license-reset-device, list-available-packs, lovable-credits-api, lovable-credits-public, lovax-api, mark-provider-refund-manual, misticpay-create-recharge, misticpay-list-transactions, misticpay-webhook, pack-admin-adjust, pack-create-purchase, pack-generate-key, place-method-license-order, place-reseller-order, pricing-issues, provider-api, public-extension-download, recharge-plan-cancel, recharge-plan-cron, recharge-plan-manual-sale, recharge-plan-public, refund-credit-recharge-balance, refund-sale-balance, release-pending-order, request-refund, reseller-api, reseller-credit-costs, reseller-credits-api, reseller-license-action, reseller-recharge-api, reseller-webhooks-dispatcher, reset-demo-account, retry-provider-refund, storefront-create-order, storefront-create-trial, storefront-order-status, subscription-cancel-charge, subscription-create-charge, subscription-cron-tick, subscription-generate-key, sync-credit-purchase-status, system-whatsapp-api, system-whatsapp-notify, system-whatsapp-webhook, telegram-balance-check, telegram-delivery-progress, telegram-dispatch, telegram-webhook, test-evolution-connection, test-misticpay-connection

(`_shared` é só código compartilhado, não é função deployada.)

Configurações especiais (de `supabase/config.toml`) com `verify_jwt=false` que você precisa reproduzir no novo projeto:
generate-testimonials-ai, expire-pending-storefront-orders, telegram-webhook, telegram-dispatch, telegram-balance-check, evolution-send-sale, telegram-delivery-progress, apply-recharge-schedule, subscription-create-charge, system-whatsapp-webhook, dev-release-storefront-pix, system-whatsapp-notify, recharge-plan-public, recharge-plan-cron.

---

## 5. Secrets configurados (7)

Recriar todos no novo projeto (Functions → Secrets):

- EVOLUTION_API_KEY
- EVOLUTION_BASE_URL
- EXTENSION_PROVIDER_API_KEY
- LOVABLE_API_KEY (gerar nova no painel novo — é o gateway de IA do Lovable; fora do Lovable, troque por chave OpenAI/Anthropic equivalente nas funções que usam)
- MISTICPAY_CLIENT_ID
- MISTICPAY_CLIENT_SECRET
- TELEGRAM_API_KEY (no Lovable era via connector; no novo Supabase é secret comum)

Os automáticos `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` já vêm preenchidos pelo novo projeto.

---

## 6. Webhooks / URLs externos a atualizar

### Telegram
- Chat ID atual: `970755762`
- Bot token: vive em `TELEGRAM_API_KEY` (secret)
- Webhook do bot que precisa ser reapontado (via `setWebhook`):
  - Atual: `https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/telegram-webhook`
  - Novo: `https://<novo-projeto>.supabase.co/functions/v1/telegram-webhook`

### Evolution API (WhatsApp do sistema)
- Base URL salva em secret `EVOLUTION_BASE_URL`
- Webhook do sistema (configurado no painel da Evolution para receber eventos):
  - Atual: `https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/system-whatsapp-webhook?secret=<webhook_secret>`
  - Novo: `https://<novo-projeto>.supabase.co/functions/v1/system-whatsapp-webhook?secret=<webhook_secret>`
  - O `webhook_secret` está em `system_whatsapp_settings.webhook_secret` — exporte junto com a tabela.
- Instância: `system` · Status atual: `connected`
- Revendedores com Evolution própria têm webhook em `reseller_integrations` (já está incluso nos 6 registros da tabela).

### MisticPay (gateway de pagamento)
- Credenciais globais em secrets `MISTICPAY_CLIENT_ID` / `MISTICPAY_CLIENT_SECRET`
- Webhook a reconfigurar no painel da MisticPay:
  - Atual: `https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/misticpay-webhook`
  - Novo: `https://<novo-projeto>.supabase.co/functions/v1/misticpay-webhook`
- Revendedores que conectaram MisticPay próprio têm credenciais em `reseller_integrations` (vão junto na exportação).

### Provedor de licenças externo (Lovax)
- Tabela `provider_settings` (1 registro):
  - `base_url`: `https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api`
  - `api_key`: armazenado na própria linha (exporte a tabela)
  - `webhook_url`: NULL (não há webhook reverso configurado)

### Provedor de recargas (Lovable Credits)
- Chave em `reseller_integrations.lovable_credits_api_key` por revendedor — exporte a tabela.

---

## Project ref e URLs do Lovable Cloud atual (para anotar)

- Project ref: `qoemkofkeleuhjifvauh`
- URL base das functions: `https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/<nome>`
- Domínios do frontend: `lovconnect.store`, `www.lovconnect.store`, `lovconnect.lovable.app`

---

## Próximos passos sugeridos (para você aprovar ou ajustar)

1. Confirme se quer que eu gere agora **scripts auxiliares** (apenas planejar; eu só crio depois que sair do plan mode):
   - `scripts/export-all-csv.sh` — exporta as 75 tabelas em CSV de uma vez via psql (precisa rodar fora do Cloud, já que aqui não temos `SERVICE_ROLE_KEY`).
   - `scripts/redeploy-all-functions.sh` — `supabase functions deploy` para as 73 funções com os flags certos de `verify_jwt`.
   - `scripts/seed-secrets.sh` — `supabase secrets set` para todos os 7 secrets.
   - `scripts/migrate-auth-users.ts` — usa Admin API para recriar `auth.users` preservando hashes bcrypt.
2. Se preferir, posso só atualizar o `MIGRATION.md` com esse inventário consolidado.

Me diga quais desses arquivos quer que eu prepare e eu monto o pacote completo.
