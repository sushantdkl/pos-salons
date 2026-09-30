#!/usr/bin/env bash
# Full QA against the local *_qa database (Git Bash on Windows).
#   bash scripts/qa/run-all.sh [prod|dev]
# prod builds into .next-qa (NEXT_DIST_DIR) so a running `npm run dev` (.next) is never touched.
# dev mode is not supported while your own dev server is running: both would share .next.
# Migrates + resets the QA database, starts the app on :3013, runs the financial scenario,
# the report-workspace consistency checks, the permission audit, the responsive/browser audit, the appointments, suppliers, customers, HRM, loyalty/review and feature scenarios,
# then an API sweep and a whole-site crawl (every role, every sidebar link and tab) on demo data, then stops the app.
# Logs and screenshots go to test-results/qa (gitignored).
set -u
cd "$(dirname "$0")/../.."
MODE=${1:-prod}
export NEXT_DIST_DIR=.next-qa
OUT=test-results/qa; mkdir -p "$OUT"
QA="$(grep ^DATABASE_URL= .env.local | cut -d= -f2- | sed -E 's#/([a-z0-9_]+)$#/\1_qa#')"
killport() { PID=$(netstat -ano | grep -E ":3013 .*LISTENING" | awk '{print $5}' | head -1); [ -n "$PID" ] && taskkill //PID "$PID" //F //T >/dev/null 2>&1; }
killport
DATABASE_URL="$QA" PG_SSL=false node scripts/migrate.mjs | grep -v '^skip'
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs || exit 1
if [ "$MODE" = prod ]; then npx next build > "$OUT/build.log" 2>&1 || { echo "build failed — see $OUT/build.log"; exit 1; }; fi
if [ "$MODE" = prod ]; then DATABASE_URL="$QA" PG_SSL=false PORT=3013 NODE_ENV=production node server.js > "$OUT/server.log" 2>&1 &
else DATABASE_URL="$QA" PG_SSL=false npx next dev -p 3013 > "$OUT/server.log" 2>&1 & fi
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://localhost:3013/api/health | grep -q 200 && break; sleep 3; done
STATUS=0
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/financial-scenario.mjs > "$OUT/scenario.txt" 2>&1 || STATUS=1
QA_BASE_URL=http://localhost:3013 node scripts/qa/reports-scenario.mjs > "$OUT/reports.txt" 2>&1 || STATUS=1
QA_BASE_URL=http://localhost:3013 node scripts/qa/permission-audit.mjs > "$OUT/permissions.txt" 2>&1 || STATUS=1
# The browser audit reads the financial scenario's data, so it runs before the reseed below.
QA_BASE_URL=http://localhost:3013 QA_SHOTS="$OUT/shots" node scripts/qa/responsive-audit.mjs > "$OUT/ui.txt" 2>&1 || STATUS=1
# Appointments start from a clean database.
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/appointments-scenario.mjs > "$OUT/appointments.txt" 2>&1 || STATUS=1
# Suppliers open their own drawer, so they also start clean.
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/suppliers-scenario.mjs > "$OUT/suppliers.txt" 2>&1 || STATUS=1
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/customers-scenario.mjs > "$OUT/customers.txt" 2>&1 || STATUS=1
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/hrm-scenario.mjs > "$OUT/hrm.txt" 2>&1 || STATUS=1
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL="$QA" node scripts/qa/loyalty-scenario.mjs > "$OUT/loyalty.txt" 2>&1 || STATUS=1
# Feature logic for the remaining modules (expenses, payroll, stock, services, staff, savings,
# printer, customers, website) on a clean database.
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 node scripts/qa/features-scenario.mjs > "$OUT/features.txt" 2>&1 || STATUS=1
# Cash In / Out, exchange, commission advances, expense categories + paging, day report.
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 node scripts/qa/cash-commission-scenario.mjs > "$OUT/cash.txt" 2>&1 || STATUS=1
# Whole-site crawl + API sweep on 60 days of realistic demo data (QA copy only).
DATABASE_URL="$QA" node scripts/qa/seed-qa.mjs > /dev/null
DATABASE_URL="$QA" DAYS=60 node scripts/demo/seed-demo.mjs > /dev/null
QA_BASE_URL=http://localhost:3013 node scripts/qa/api-sweep.mjs > "$OUT/api.txt" 2>&1 || STATUS=1
QA_BASE_URL=http://localhost:3013 node scripts/qa/site-crawl.mjs > "$OUT/crawl.txt" 2>&1 || STATUS=1
killport
grep -hE "checks passed|^FAIL|server errors|problems$" "$OUT/scenario.txt" "$OUT/reports.txt" "$OUT/appointments.txt" "$OUT/suppliers.txt" "$OUT/customers.txt" "$OUT/hrm.txt" "$OUT/loyalty.txt" "$OUT/features.txt" "$OUT/cash.txt" "$OUT/permissions.txt" "$OUT/ui.txt" "$OUT/api.txt" "$OUT/crawl.txt"
exit $STATUS
