#!/usr/bin/env bash
# Pulls just the variables the e2e harness needs from Railway into a local,
# gitignored .env. Deliberately does NOT pull PAYME_KEY (the live Payme key)
# from payme-webhook - only PAYME_TEST_KEY (sandbox) - so a live charge is
# not even possible from this directory, regardless of what a script does.
set -euo pipefail
cd "$(dirname "$0")"

WEBAPP_DIR="../.."
PAYME_DIR="../../../payme-webhook"

get() { railway variables --service "$1" --kv 2>/dev/null | grep "^$2=" | cut -d= -f2-; }

TELEGRAM_TOKEN=$(cd "$WEBAPP_DIR" && get vacancy-webapp TELEGRAM_TOKEN)
BOT_USERNAME=$(cd "$WEBAPP_DIR" && get vacancy-webapp BOT_USERNAME)
WEBAPP_URL="https://$(cd "$WEBAPP_DIR" && get vacancy-webapp RAILWAY_PUBLIC_DOMAIN)"
PAYME_TEST_KEY=$(cd "$PAYME_DIR" && get payme-webhook PAYME_TEST_KEY)
PAYME_WEBHOOK_URL="https://$(cd "$PAYME_DIR" && get payme-webhook RAILWAY_PUBLIC_DOMAIN)/payme"

cat > .env <<EOF
TELEGRAM_TOKEN=$TELEGRAM_TOKEN
BOT_USERNAME=$BOT_USERNAME
WEBAPP_URL=$WEBAPP_URL
PAYME_TEST_KEY=$PAYME_TEST_KEY
PAYME_WEBHOOK_URL=$PAYME_WEBHOOK_URL
EOF

echo "Wrote tests/e2e/.env (gitignored) with:"
grep -oE '^[A-Z_]+=' .env
