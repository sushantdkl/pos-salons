#!/usr/bin/env bash
# LOCAL DEMO — a separate database full of realistic sample data, for this computer only.
#   npm run demo:setup   (build / rebuild thehaircut_demo)
#   npm run demo:start   (open it at http://localhost:3005, logins qa_admin / qa_cashier / qa_barber, password QaPass!2026)
# Your own local database (and production) are never touched: the data is built in the *_qa copy,
# then cloned into <db>_demo. Refuses any non-local database host.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="$(grep ^DATABASE_URL= .env.local | cut -d= -f2-)"
HOST="$(node -e "console.log(new URL(process.argv[1]).hostname)" "$SRC")"
case "$HOST" in localhost|127.0.0.1|::1) ;; *) echo "Refusing: DATABASE_URL host '$HOST' is not local. Demo data is localhost-only."; exit 1 ;; esac
QA="$(echo "$SRC" | sed -E 's#/([a-z0-9_]+)$#/\1_qa#')"
DAYS="${DAYS:-60}"

node --env-file=.env.local scripts/qa/create-qa-db.mjs >/dev/null || true
DATABASE_URL="$QA" PG_SSL=false node scripts/migrate.mjs | grep -v '^skip' || true
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs
DATABASE_URL="$QA" DAYS="$DAYS" node scripts/demo/seed-demo.mjs
DATABASE_URL="$SRC" node scripts/demo/clone-demo.mjs
echo "Done. Start it with: npm run demo:start  →  http://localhost:3005"
