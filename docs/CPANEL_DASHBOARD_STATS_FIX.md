# cPanel Dashboard Stats Fix

If Admin or Cashier dashboards show `Failed to fetch dashboard stats` on cPanel while local production mode works, the usual cause is an older PostgreSQL schema on cPanel.

## Required Environment Variables

Set these in cPanel Node.js App:

```env
NODE_ENV=production
NEXT_PUBLIC_LICENSE_ENABLED=false
NEXT_PUBLIC_SALON_WHATSAPP_NUMBER=9779858051694
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://your-domain
```

## Required One-Time Migrations

Run these in phpPgAdmin, in this order:

```text
docs/migrations/2026-06-23-add-salon-bill-payment-fields.sql
docs/migrations/2026-07-21-final-pos-sync-enhancements.sql
docs/migrations/create_savings_deposits.sql
```

`docs/migrations/create_savings_deposits.sql` is the production-safe cPanel migration for:

```text
relation "savings_deposits" does not exist
```

It creates the `savings_deposits` table, its indexes, and safely imports legacy `CASH_TRANSFER` expense records if they exist.

If old bills have incorrect split payment values, first review the diagnostic output, then use:

```text
docs/migrations/2026-07-31-repair-payment-splits.sql
```

Do not run the repair script blindly; it is only for confirmed historical bill IDs.

## Quick Schema Check

Run this in phpPgAdmin after the migrations:

```sql
WITH required(table_name, column_name) AS (
  VALUES
    ('salon_bills', 'cash_amount'),
    ('salon_bills', 'qr_amount'),
    ('salon_bills', 'qr_type'),
    ('salon_bills', 'transaction_time'),
    ('salon_bills', 'is_printed'),
    ('salon_bill_items', 'staff_name_snapshot'),
    ('expenses', 'record_type'),
    ('savings_deposits', 'deposit_date'),
    ('savings_deposits', 'source_account'),
    ('walk_in_tokens', 'invoice_id'),
    ('walk_in_tokens', 'billed_at'),
    ('staff_profiles', 'salon_role')
)
SELECT r.table_name, r.column_name
FROM required r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = r.table_name
 AND c.column_name = r.column_name
WHERE c.column_name IS NULL
ORDER BY r.table_name, r.column_name;
```

Expected result:

```text
0 rows
```

## Restart cPanel App

After uploading the fresh build and confirming the schema:

```bash
cd /home/thehairc/salon-pos
npm install --omit=dev
mkdir -p tmp
touch tmp/restart.txt
```

Then restart the app from cPanel Setup Node.js App.
