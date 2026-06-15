#!/usr/bin/env bash
# Exporta todas as tabelas do schema public em CSV.
# Uso:
#   export PGHOST=db.<ref>.supabase.co PGPORT=5432 PGUSER=postgres \
#          PGPASSWORD='...' PGDATABASE=postgres
#   ./scripts/export-all-csv.sh ./csv-export
#
# Requisitos: psql instalado. Não precisa de SERVICE_ROLE_KEY — usa conexão direta.
# Observação: no Lovable Cloud o acesso direto ao Postgres NÃO é exposto.
#   Rode esse script depois que migrar para um Supabase próprio, OU peça ao suporte
#   do Lovable um dump completo. Para o Cloud, use Cloud → Database → Tables → Export
#   tabela por tabela.

set -euo pipefail

OUT_DIR="${1:-./csv-export}"
mkdir -p "$OUT_DIR"

# Ordem por volume de linhas (maior primeiro). Tabelas vazias incluídas para schema-only.
TABLES=(
  orders
  telegram_outbox
  reseller_api_usage
  reseller_pack_ledger
  balance_transactions
  trial_registrations
  reseller_customers
  system_whatsapp_log
  storefront_orders
  notifications
  recharge_plan_deliveries
  manual_financial_entries
  reseller_license_prices
  reseller_credit_purchases
  recharge_intents
  tier_credit_prices
  activation_logs
  affiliate_codes
  user_roles
  profiles
  resellers
  reseller_credit_cost_overrides
  reseller_credit_prices
  tier_license_prices
  reseller_api_keys
  system_whatsapp_events
  refund_requests
  user_presence
  reseller_balances
  reseller_referrals
  reseller_pack_purchases
  storefront_testimonials
  blocked_sale_attempts
  app_settings
  activation_payments
  reseller_storefronts
  credit_pricing_plans
  reseller_tier_state
  hwid_reset_logs
  license_base_costs
  reseller_integrations
  license_packs
  extension_versions
  reseller_pack_balances
  reseller_tiers
  pending_storefront_charges
  reseller_recharge_plan_subscriptions
  promotion_logs
  reseller_recharge_plan_prices
  storefront_reports
  reseller_extension_price_overrides
  reseller_license_cost_overrides
  provider_credit_orders
  extensions
  promotions
  reseller_subscription_charges
  recharge_plan_tutorial_media
  admin_audit_logs
  recharge_plans
  telegram_settings
  recharge_schedule
  reseller_api_webhook_deliveries
  system_whatsapp_settings
  provider_settings
  manual_recharge_metadata
  global_settings
  reseller_extensions
  reseller_api_idempotency
  announcement_reads
  extension_customizations
  direct_sales
  client_extensions
  partner_price_history
  announcements
  ranking_prizes
  reseller_subscription_recurrences
  reseller_extension_prices
  tier_extension_prices
  telegram_notification_failures
)

for t in "${TABLES[@]}"; do
  echo "→ exportando public.$t ..."
  psql -v ON_ERROR_STOP=1 \
    -c "\COPY (SELECT * FROM public.$t) TO '$OUT_DIR/$t.csv' WITH CSV HEADER"
done

echo "✓ Exportação concluída em: $OUT_DIR"
echo "  Próximo passo: rodar scripts/import-all-csv.sh apontando para o novo banco."