# The Hair Cut POS — Migration Guide

How to take this release to a PostgreSQL database (cPanel/Passenger or local/staging).

**The golden rule: migrations run BEFORE the application code that needs them.**
No migration ever runs from an API request, from a dashboard load, or at Passenger startup.
Every migration in `docs/migrations/` is additive and idempotent — running one twice is safe.

---

## 1. Migrations in this release

Apply in this order. Each is safe to re-run.

| # | File | Adds | Required by |
|---|------|------|-------------|
| 1 | `docs/migrations/create_savings_deposits.sql` | `savings_deposits` table | Savings pages, all savings totals |
| 2 | `docs/migrations/2026-08-10-business-day-sessions.sql` | `business_days`, `store_sessions`, `business_day_id` / `store_session_id` on `salon_bills`, `expenses`, `savings_deposits`, `walk_in_tokens`, plus indexes | Opening & Closing, Business Day History, current-day KPIs |
| 3 | `docs/migrations/2026-08-11-revenue-vs-cash-attribution.sql` | `salon_bills.revenue_business_day_id`, `salon_bills.payment_received_at`, 2 indexes; backfills existing rows | Correct backdated-bill revenue attribution |
| 4 | `docs/migrations/2026-08-11-salary-advances.sql` | `salary_advances` table, `salary_advance_applications` link table, `expenses.advance_id`, `salary_payments.advance_applied` | Advance Salary |
| 5 | `docs/migrations/2026-08-11-fix-future-business-days.sql` | **Repair only** — no schema change. Clears business days dated in the future that never traded | Optional; run once if the health check in §9 reports any |

If your database already has 1 and 2 (check with the verification queries below), apply only what is missing.

`docs/postgresql-schema.sql` is the full base schema for a **brand-new** database. An existing
database must use the migration files, never the base schema.

---

## 2. Deployment order

Do not deploy the application before the migration. New code queries columns that
would not exist yet, and every dashboard would fail with `relation/column does not exist`.

```
1.  Back up the production database          (see §3)
2.  Review the migration SQL                 (read it; it is short)
3.  Apply migrations in the order above      (see §4)
4.  Verify schema                            (see §5)
5.  Verify database-user privileges          (see §6)
6.  Upload matching application source
7.  Upload a matching fresh .next build      (built from THIS source)
8.  npm ci --omit=dev                        (production dependencies)
9.  Restart Passenger                        (touch tmp/restart.txt)
10. Smoke-test                               (see §7)
```

Rolling back code without rolling back the schema is safe — the added columns and tables are
additive and the previous code simply ignores them.

---

## 3. Back up first

```bash
pg_dump --no-owner --no-privileges -Fc -d "$DATABASE_URL" -f backup-$(date +%Y%m%d-%H%M).dump
```

On cPanel without shell access: **phpPgAdmin → Database → Export → Structure and data → Download**.

Restore, if it is ever needed:

```bash
pg_restore --clean --no-owner --no-privileges -d "$DATABASE_URL" backup-YYYYMMDD-HHMM.dump
```

Do not skip this step even though the migrations are additive.

---

## 4. Apply the migrations

### Option A — psql (local, staging, or cPanel with SSH)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/create_savings_deposits.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/2026-08-10-business-day-sessions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/2026-08-11-revenue-vs-cash-attribution.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/2026-08-11-salary-advances.sql

# Repair, only if the future-dated-day health check in section 9 returns rows.
# It prints any future-dated day that HAS traded; those are left for manual review.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/2026-08-11-fix-future-business-days.sql
```

`-v ON_ERROR_STOP=1` aborts on the first error instead of continuing through the file.

### Option B — phpPgAdmin (cPanel, no shell)

For each file, in order:

1. phpPgAdmin → select the database → **SQL** tab.
2. Paste the entire file contents (each file is wrapped in `BEGIN; … COMMIT;`).
3. Execute. Confirm it reports success.
4. Move to the next file.

Do not paste several migrations into one window — apply and confirm them one at a time.

### Option C — the repo helper (local/staging only)

```bash
node scripts/apply-migration.js docs/migrations/2026-08-11-salary-advances.sql
```

Reads `DATABASE_URL` from `.env.local`. It refuses to run against a host that is not local
unless `ALLOW_REMOTE_MIGRATION=1` is set, so it cannot touch production by accident.

---

## 5. Verify the schema

Run this afterwards. Every row must report `OK`.

```sql
SELECT 'savings_deposits'      AS object, CASE WHEN to_regclass('public.savings_deposits')      IS NULL THEN 'MISSING' ELSE 'OK' END AS status
UNION ALL SELECT 'business_days',          CASE WHEN to_regclass('public.business_days')        IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'store_sessions',         CASE WHEN to_regclass('public.store_sessions')       IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'salary_advances',        CASE WHEN to_regclass('public.salary_advances')      IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'salary_advance_applications', CASE WHEN to_regclass('public.salary_advance_applications') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'salon_bills.business_day_id',         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salon_bills' AND column_name='business_day_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'salon_bills.store_session_id',        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salon_bills' AND column_name='store_session_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'salon_bills.revenue_business_day_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salon_bills' AND column_name='revenue_business_day_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'salon_bills.payment_received_at',     CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salon_bills' AND column_name='payment_received_at') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'expenses.business_day_id',            CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='business_day_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'expenses.advance_id',                 CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='advance_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'walk_in_tokens.business_day_id',      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='walk_in_tokens' AND column_name='business_day_id') THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'savings_deposits.business_day_id',    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='savings_deposits' AND column_name='business_day_id') THEN 'OK' ELSE 'MISSING' END;
```

Indexes and the single-open-day / single-open-session guarantees:

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'uniq_open_business_day', 'uniq_open_store_session',
  'idx_bills_business_day', 'idx_bills_store_session',
  'idx_bills_revenue_business_day', 'idx_bills_payment_received_at',
  'idx_salary_advances_staff', 'idx_salary_advances_status'
) ORDER BY indexname;
```

Backfill sanity — both must return `0`:

```sql
SELECT COUNT(*) AS bills_missing_payment_time FROM salon_bills WHERE payment_received_at IS NULL;
SELECT COUNT(*) AS bills_missing_revenue_day  FROM salon_bills
 WHERE business_day_id IS NOT NULL AND backdated_by IS NULL AND revenue_business_day_id IS NULL;
```

---

## 6. Database privileges

The application user needs `SELECT, INSERT, UPDATE, DELETE` on all tables and `USAGE, SELECT`
on all sequences. After adding tables, re-grant:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <app_user>;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <app_user>;
```

A missing sequence grant shows up as `permission denied for sequence …` on the first insert,
not at startup — so verify it before going live.

---

## 7. Smoke test after restart

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/health          # 200
```

Then, signed in as admin:

- `/admin/dashboard` — loads, KPIs render, no `NaN`
- `/store/opening-closing` — store status renders; Open Store works
- `/dashboard/admin/business-days` — history renders
- `/admin/executive-summary` — report renders for Today and a Custom Range
- `/dashboard/admin/expenses/salary` — salary list and advances render

As cashier:

- `/dashboard/cashier`, `/cashier/executive-summary`, `/admin/billing`, `/store/opening-closing`

Then confirm no `relation … does not exist` / `column … does not exist` in the Passenger log.

---

## 8. Rollback

The migrations are additive, so the safe rollback is **redeploy the previous application
build and leave the schema alone**. The new columns and tables are simply unused.

Only if you must fully revert the schema, and only from a backup taken in §3:

```sql
-- Destroys advance history. Restore from the §3 backup instead when possible.
BEGIN;
ALTER TABLE expenses    DROP COLUMN IF EXISTS advance_id;
DROP TABLE IF EXISTS salary_advance_applications;
DROP TABLE IF EXISTS salary_advances;
ALTER TABLE salon_bills DROP COLUMN IF EXISTS revenue_business_day_id;
ALTER TABLE salon_bills DROP COLUMN IF EXISTS payment_received_at;
COMMIT;
```

Do not drop `business_days` / `store_sessions` on a database that has traded against them —
bills reference them, and the reconciliation history is not recoverable from anywhere else.

---

## 9. Health checks worth running periodically

```sql
-- More than one open business day or store session (must be 0 rows)
SELECT 'open business days' AS check, COUNT(*) FROM business_days  WHERE status = 'OPEN' HAVING COUNT(*) > 1
UNION ALL
SELECT 'open store sessions', COUNT(*) FROM store_sessions WHERE status = 'OPEN' HAVING COUNT(*) > 1;

-- A business day dated in the future (blocked since 2026-08-11; legacy rows may exist)
SELECT id, business_date, status FROM business_days
WHERE business_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date;

-- Closed sessions whose stored difference disagrees with counted - expected
SELECT id, business_day_id, session_number, expected_cash, counted_cash, cash_difference
FROM store_sessions
WHERE status = 'CLOSED' AND ABS(cash_difference - (counted_cash - expected_cash)) > 0.01;

-- Advances whose applied amount exceeds the advance itself
SELECT id, staff_id, amount, applied_amount FROM salary_advances WHERE applied_amount > amount + 0.01;
```

A future-dated business day is now prevented at the source (Start Next Business Day refuses a
date beyond Nepal today, and the button is disabled with the reason shown).

For rows created before that guard existed, run
`docs/migrations/2026-08-11-fix-future-business-days.sql`. It clears future-dated days that
never traded — unambiguous, nothing can be misattributed — and **deliberately leaves alone**
any that did trade, printing them instead: re-dating real trading history would move revenue
between reporting periods. Business Day History flags every remaining one with a FUTURE badge
and an explanatory banner, so none can go unnoticed.
