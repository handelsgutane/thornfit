#!/usr/bin/env bash
#
# sync-catalog.sh — trigger Woo → Supabase katalog-backfill manuelt.
#
# Kaller reconciliation-endepunktet (/api/cron/woo-reconciliation), som henter
# hele WooCommerce-katalogen og upserter den inn i Supabase-speilet. Dette er
# nøyaktig samme jobb som den nattlige Vercel-cronen — scriptet trigger den
# bare on-demand (typisk for initial backfill av en fersk database).
#
# KREVER at appen kjører — lokalt (`npm run dev`) eller deployet på Vercel.
# Scriptet starter ikke serveren selv.
#
# Bruk:
#   ./scripts/sync-catalog.sh                          # localhost:3000, parts=categories,tags,brands,products
#   ./scripts/sync-catalog.sh https://thornfit.no      # mot deployet app
#   ./scripts/sync-catalog.sh "" all                   # full sync (også blog + discounts)
#   ./scripts/sync-catalog.sh "" categories,products   # hvis `brands`-endepunktet 404-er
#
# CRON_SECRET leses fra .env.local (eller fra miljøet hvis allerede satt).
# Sett evt. SYNC_BASE_URL i .env.local så slipper du å oppgi URL hver gang.
#
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Les én nøkkel fra miljøet eller .env.local ------------------------------
# NB: vi source-er IKKE hele .env.local — WP_ADMIN_APP_PASSWORD kan inneholde
# mellomrom som ville knekt `source`. Vi henter bare nøklene vi trenger.
read_env() {
  local key="$1"
  local current="${!key:-}"
  if [[ -n "$current" ]]; then printf '%s' "$current"; return; fi
  [[ -f .env.local ]] || return 0
  grep -E "^(export[[:space:]]+)?${key}=" .env.local | tail -n1 \
    | sed -E "s/^(export[[:space:]]+)?${key}=//; s/^[\"']//; s/[\"']\$//"
}

CRON_SECRET="$(read_env CRON_SECRET)"
SYNC_BASE_URL="$(read_env SYNC_BASE_URL)"

# --- Konfig ------------------------------------------------------------------
BASE_URL="${1:-${SYNC_BASE_URL:-http://localhost:3000}}"
BASE_URL="${BASE_URL%/}"                       # strip trailing slash
PARTS="${2:-categories,tags,brands,products}"  # hopp over blog+discounts ved første kjøring
ENDPOINT="${BASE_URL}/api/cron/woo-reconciliation?parts=${PARTS}"

if [[ -z "${CRON_SECRET}" ]]; then
  echo "❌ CRON_SECRET er ikke satt. Legg den i .env.local eller eksporter den." >&2
  exit 1
fi

# --- Trigg synken ------------------------------------------------------------
echo "▶  Synker katalog"
echo "   endepunkt: ${ENDPOINT}"
echo "   (kan ta flere minutter for store kataloger …)"
echo

set +e
RESPONSE="$(curl -sS --max-time 600 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${ENDPOINT}")"
CURL_EXIT=$?
set -e

if [[ ${CURL_EXIT} -eq 7 ]]; then
  echo "❌ Når ikke ${BASE_URL} — kjører appen? Start den med 'npm run dev'," >&2
  echo "   eller oppgi en deployet URL: ./scripts/sync-catalog.sh https://<host>" >&2
  exit 1
elif [[ ${CURL_EXIT} -ne 0 ]]; then
  echo "❌ curl feilet (exit ${CURL_EXIT})." >&2
  exit 1
fi

# --- Vis resultat ------------------------------------------------------------
if echo "${RESPONSE}" | jq . 2>/dev/null; then
  STATUS="$(echo "${RESPONSE}" | jq -r '.status // "unknown"')"
else
  # Ikke-JSON svar — typisk 401 (feil CRON_SECRET) eller en Next-feilside.
  echo "${RESPONSE}"
  STATUS="unknown"
fi

echo
if [[ "${STATUS}" != "ok" ]]; then
  echo "❌ Sync feilet (status=${STATUS}). Se 'error'-feltet over." >&2
  echo "   Tips: feiler 'brands'? Kjør:  ./scripts/sync-catalog.sh \"\" categories,products" >&2
  exit 1
fi

echo "✅ Sync ok — sjekk 'products.upserted' over."
