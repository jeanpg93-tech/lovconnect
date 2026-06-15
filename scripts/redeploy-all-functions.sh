#!/usr/bin/env bash
# Faz deploy de todas as 73 Edge Functions no novo projeto Supabase.
# Uso:
#   supabase login
#   supabase link --project-ref <novo-ref>
#   ./scripts/redeploy-all-functions.sh
#
# As funções listadas em NO_JWT_FUNCTIONS são deployadas com --no-verify-jwt
# (espelhando o supabase/config.toml atual). As demais usam o padrão (verify_jwt=true,
# que no projeto atual está como false por padrão do Lovable — ajuste conforme sua
# preferência fora do Lovable).

set -euo pipefail

ALL_FUNCTIONS=(
  activation-create-pix activation-review activation-submit-proof activation-waive
  admin-create-demo-account admin-create-monthly-reseller admin-delete-demo-account
  apply-promotion-schedule apply-recharge-schedule audit-cancelled-purchases
  cancel-credit-purchase cancel-credit-recharge cancel-sale cancel-storefront-order
  check-misticpay-withdraw dev-release-storefront-pix evolution-api evolution-send-sale
  expire-pending-storefront-orders extension-build-zip extension-config
  generate-testimonials-ai gerente-estornar-venda get-my-misticpay-credentials
  license-reset-device list-available-packs lovable-credits-api lovable-credits-public
  lovax-api mark-provider-refund-manual misticpay-create-recharge
  misticpay-list-transactions misticpay-webhook pack-admin-adjust pack-create-purchase
  pack-generate-key place-method-license-order place-reseller-order pricing-issues
  provider-api public-extension-download recharge-plan-cancel recharge-plan-cron
  recharge-plan-manual-sale recharge-plan-public refund-credit-recharge-balance
  refund-sale-balance release-pending-order request-refund reseller-api
  reseller-credit-costs reseller-credits-api reseller-license-action
  reseller-recharge-api reseller-webhooks-dispatcher reset-demo-account
  retry-provider-refund storefront-create-order storefront-create-trial
  storefront-order-status subscription-cancel-charge subscription-create-charge
  subscription-cron-tick subscription-generate-key sync-credit-purchase-status
  system-whatsapp-api system-whatsapp-notify system-whatsapp-webhook
  telegram-balance-check telegram-delivery-progress telegram-dispatch telegram-webhook
  test-evolution-connection test-misticpay-connection
)

# Funções que devem ficar com verify_jwt = false (vide supabase/config.toml)
NO_JWT_FUNCTIONS=(
  generate-testimonials-ai
  expire-pending-storefront-orders
  telegram-webhook
  telegram-dispatch
  telegram-balance-check
  evolution-send-sale
  telegram-delivery-progress
  apply-recharge-schedule
  subscription-create-charge
  system-whatsapp-webhook
  dev-release-storefront-pix
  system-whatsapp-notify
  recharge-plan-public
  recharge-plan-cron
)

is_no_jwt() {
  local f="$1"
  for x in "${NO_JWT_FUNCTIONS[@]}"; do
    [[ "$x" == "$f" ]] && return 0
  done
  return 1
}

for f in "${ALL_FUNCTIONS[@]}"; do
  if is_no_jwt "$f"; then
    echo "→ deploy $f (--no-verify-jwt)"
    supabase functions deploy "$f" --no-verify-jwt
  else
    echo "→ deploy $f"
    supabase functions deploy "$f"
  fi
done

echo "✓ Todas as 73 funções foram deployadas."