#!/usr/bin/env bash
# Configura todos os secrets necessários no novo projeto Supabase.
# Uso:
#   supabase link --project-ref <novo-ref>
#   # preencha os valores abaixo OU exporte como variáveis de ambiente antes de rodar
#   ./scripts/seed-secrets.sh
#
# Você pode setar via env vars antes para não deixar segredos em arquivo:
#   export EVOLUTION_API_KEY=...
#   export TELEGRAM_API_KEY=...
#   etc.

set -euo pipefail

: "${EVOLUTION_API_KEY:?defina EVOLUTION_API_KEY}"
: "${EVOLUTION_BASE_URL:?defina EVOLUTION_BASE_URL}"
: "${EXTENSION_PROVIDER_API_KEY:?defina EXTENSION_PROVIDER_API_KEY}"
: "${MISTICPAY_CLIENT_ID:?defina MISTICPAY_CLIENT_ID}"
: "${MISTICPAY_CLIENT_SECRET:?defina MISTICPAY_CLIENT_SECRET}"
: "${TELEGRAM_API_KEY:?defina TELEGRAM_API_KEY}"
# LOVABLE_API_KEY só existe dentro do Lovable. Fora dele, troque por uma chave
# de provider de IA (OpenAI/Anthropic) nas edge functions que consomem o gateway.
# Se mesmo assim quiser manter o nome, descomente abaixo:
# : "${LOVABLE_API_KEY:?defina LOVABLE_API_KEY (ou remova esta linha)}"

supabase secrets set \
  EVOLUTION_API_KEY="$EVOLUTION_API_KEY" \
  EVOLUTION_BASE_URL="$EVOLUTION_BASE_URL" \
  EXTENSION_PROVIDER_API_KEY="$EXTENSION_PROVIDER_API_KEY" \
  MISTICPAY_CLIENT_ID="$MISTICPAY_CLIENT_ID" \
  MISTICPAY_CLIENT_SECRET="$MISTICPAY_CLIENT_SECRET" \
  TELEGRAM_API_KEY="$TELEGRAM_API_KEY"

# if [[ -n "${LOVABLE_API_KEY:-}" ]]; then
#   supabase secrets set LOVABLE_API_KEY="$LOVABLE_API_KEY"
# fi

echo "✓ Secrets configurados. Confira com: supabase secrets list"