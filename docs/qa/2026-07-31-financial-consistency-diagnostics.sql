-- Financial consistency diagnostics for the Salon POS PostgreSQL database.
--
-- READ ONLY. Every statement below is a SELECT. Nothing here modifies production data.
-- Run it in phpPgAdmin or psql and review each section. If a section returns rows, note
-- the bill / expense IDs and use docs/migrations/2026-07-31-repair-payment-splits.sql,
-- which only touches IDs you confirm.
--
-- Tolerance is 0.01 throughout, because money columns are NUMERIC and bills may carry
-- half-paisa rounding from percentage discounts.

-- === 1. Bills where final total <> subtotal - discount + tax + service charge ===
SELECT id,
       bill_number,
       COALESCE(transaction_time, created_at) AS transaction_at,
       subtotal,
       discount_amount,
       tax,
       service_charge,
       grand_total,
       ROUND((COALESCE(subtotal, 0) - COALESCE(discount_amount, 0)
              + COALESCE(tax, 0) + COALESCE(service_charge, 0))::numeric, 2) AS expected_total,
       ROUND((COALESCE(grand_total, 0)
              - (COALESCE(subtotal, 0) - COALESCE(discount_amount, 0)
                 + COALESCE(tax, 0) + COALESCE(service_charge, 0)))::numeric, 2) AS difference
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND ABS(COALESCE(grand_total, 0)
          - (COALESCE(subtotal, 0) - COALESCE(discount_amount, 0)
             + COALESCE(tax, 0) + COALESCE(service_charge, 0))) > 0.01
ORDER BY transaction_at DESC;

-- === 2. Bills where cash_amount + qr_amount <> final total ===
SELECT id,
       bill_number,
       COALESCE(transaction_time, created_at) AS transaction_at,
       payment_method,
       cash_amount,
       qr_amount,
       grand_total,
       ROUND((COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0) - COALESCE(grand_total, 0))::numeric, 2) AS difference
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND ABS(COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0) - COALESCE(grand_total, 0)) > 0.01
ORDER BY transaction_at DESC;

-- === 3. Online bills that wrongly carry a cash amount ===
SELECT id, bill_number, COALESCE(transaction_time, created_at) AS transaction_at,
       payment_method, qr_type, cash_amount, qr_amount, grand_total
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND LOWER(COALESCE(payment_method, '')) = 'online'
  AND COALESCE(cash_amount, 0) > 0.01
ORDER BY transaction_at DESC;

-- === 4. Cash bills that wrongly carry a QR amount ===
SELECT id, bill_number, COALESCE(transaction_time, created_at) AS transaction_at,
       payment_method, qr_type, cash_amount, qr_amount, grand_total
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND LOWER(COALESCE(payment_method, '')) = 'cash'
  AND COALESCE(qr_amount, 0) > 0.01
ORDER BY transaction_at DESC;

-- === 5. Split bills whose portions do not add up to the final total ===
SELECT id, bill_number, COALESCE(transaction_time, created_at) AS transaction_at,
       cash_amount, qr_amount, grand_total,
       ROUND((COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0) - COALESCE(grand_total, 0))::numeric, 2) AS difference
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND LOWER(COALESCE(payment_method, '')) = 'split'
  AND ABS(COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0) - COALESCE(grand_total, 0)) > 0.01
ORDER BY transaction_at DESC;

-- === 6. Bills paid online or by split with a QR amount but no QR type recorded ===
SELECT id, bill_number, COALESCE(transaction_time, created_at) AS transaction_at,
       payment_method, qr_type, qr_amount, grand_total
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND COALESCE(qr_amount, 0) > 0
  AND COALESCE(NULLIF(qr_type, ''), '') = ''
ORDER BY transaction_at DESC;

-- === 7. Bills whose total_paid disagrees with cash + QR (should be the collected total) ===
SELECT id, bill_number, payment_method, amount_paid, total_paid,
       cash_amount, qr_amount, grand_total,
       ROUND((COALESCE(total_paid, 0) - (COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0)))::numeric, 2) AS difference
FROM salon_bills
WHERE LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  AND ABS(COALESCE(total_paid, 0) - (COALESCE(cash_amount, 0) + COALESCE(qr_amount, 0))) > 0.01
ORDER BY COALESCE(transaction_time, created_at) DESC;

-- === 8. Bill-level totals vs the sum of their line items (discount explains the gap) ===
SELECT b.id, b.bill_number, b.subtotal AS bill_subtotal,
       COALESCE(items.item_total, 0) AS line_item_total,
       ROUND((COALESCE(b.subtotal, 0) - COALESCE(items.item_total, 0))::numeric, 2) AS difference
FROM salon_bills b
LEFT JOIN (
  SELECT bill_id, SUM(subtotal) AS item_total
  FROM salon_bill_items
  GROUP BY bill_id
) items ON items.bill_id = b.id
WHERE LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')
  AND ABS(COALESCE(b.subtotal, 0) - COALESCE(items.item_total, 0)) > 0.01
ORDER BY COALESCE(b.transaction_time, b.created_at) DESC;

-- === 9. Savings still stored inside the expenses table (should be in savings_deposits) ===
SELECT e.id AS expense_id,
       e.title,
       e.category,
       e.record_type,
       e.amount,
       e.payment_method,
       e.expense_date,
       s.id AS savings_deposit_id,
       CASE WHEN s.id IS NULL THEN 'NOT YET IMPORTED' ELSE 'imported' END AS import_status
FROM expenses e
LEFT JOIN savings_deposits s ON s.legacy_expense_id = e.id
WHERE COALESCE(e.record_type, 'EXPENSE') = 'CASH_TRANSFER'
   OR e.category = 'DAILY_SAVING'
ORDER BY e.expense_date DESC;

-- === 10. Expense rows whose cash + online split does not equal the amount ===
SELECT id, title, category, payment_method, amount, cash_amount, online_amount, expense_date,
       ROUND((COALESCE(cash_amount, 0) + COALESCE(online_amount, 0) - COALESCE(amount, 0))::numeric, 2) AS difference
FROM expenses
WHERE deleted_at IS NULL
  AND ABS(COALESCE(cash_amount, 0) + COALESCE(online_amount, 0) - COALESCE(amount, 0)) > 0.01
ORDER BY expense_date DESC;

-- === 11. Savings deposits that exceed the salon-wide collection for their month (review only) ===
SELECT date_trunc('month', s.deposit_date)::date AS month,
       s.source_account,
       SUM(s.amount) AS savings_total
FROM savings_deposits s
WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- === 12. Period reconciliation: what the dashboards should be showing (This Month, Asia/Kathmandu) ===
WITH period AS (
  SELECT date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date)::date AS start_date,
         (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date)
          + INTERVAL '1 month')::date AS end_date
),
bills AS (
  SELECT
    COALESCE(SUM(b.subtotal), 0) AS gross_sales_before_discount,
    COALESCE(SUM(b.discount_amount), 0) AS total_discounts,
    COALESCE(SUM(b.grand_total), 0) AS net_sales_after_discount,
    COALESCE(SUM(
      CASE
        WHEN ABS(COALESCE(b.cash_amount, 0) + COALESCE(b.qr_amount, 0) - COALESCE(b.grand_total, 0)) <= 0.01
          THEN COALESCE(b.cash_amount, 0)
        WHEN LOWER(COALESCE(b.payment_method, '')) = 'cash' THEN COALESCE(b.grand_total, 0)
        WHEN LOWER(COALESCE(b.payment_method, '')) IN ('online', 'card') THEN 0
        ELSE COALESCE(b.cash_amount, 0)
      END), 0) AS gross_cash_collected,
    COALESCE(SUM(
      CASE
        WHEN ABS(COALESCE(b.cash_amount, 0) + COALESCE(b.qr_amount, 0) - COALESCE(b.grand_total, 0)) <= 0.01
          THEN COALESCE(b.qr_amount, 0)
        WHEN LOWER(COALESCE(b.payment_method, '')) = 'online' THEN COALESCE(b.grand_total, 0)
        WHEN LOWER(COALESCE(b.payment_method, '')) = 'cash' THEN 0
        ELSE COALESCE(b.qr_amount, 0)
      END), 0) AS gross_qr_collected
  FROM salon_bills b, period p
  WHERE LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')
    AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE 'Asia/Kathmandu')::date >= p.start_date
    AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE 'Asia/Kathmandu')::date < p.end_date
),
outflows AS (
  SELECT
    COALESCE(SUM(CASE WHEN e.category NOT IN ('Staff Salary', 'Staff Commission') THEN e.amount ELSE 0 END), 0) AS operating_expenses,
    COALESCE(SUM(CASE WHEN e.category IN ('Staff Salary', 'Staff Commission') THEN e.amount ELSE 0 END), 0) AS salary_expenses
  FROM expenses e, period p
  WHERE e.deleted_at IS NULL
    AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
    AND e.expense_date >= p.start_date AND e.expense_date < p.end_date
),
savings AS (
  SELECT COALESCE(SUM(s.amount), 0) AS savings_transfers
  FROM savings_deposits s, period p
  WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
    AND s.deposit_date >= p.start_date AND s.deposit_date < p.end_date
)
SELECT b.gross_sales_before_discount,
       b.total_discounts,
       b.net_sales_after_discount,
       b.gross_cash_collected,
       b.gross_qr_collected,
       b.gross_cash_collected + b.gross_qr_collected AS gross_total_collected,
       o.operating_expenses,
       o.salary_expenses,
       s.savings_transfers,
       b.gross_cash_collected + b.gross_qr_collected
         - o.operating_expenses - o.salary_expenses - s.savings_transfers AS net_available_balance
FROM bills b, outflows o, savings s;
