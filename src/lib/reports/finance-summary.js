/**
 * Single source of truth for salon money maths.
 *
 * Every dashboard, report and summary reads its cash / QR / discount / expense / savings
 * numbers from here so the same bill can never total differently in two places.
 *
 * Definitions (all server-side, all from PostgreSQL):
 *   Subtotal          price before discount
 *   Discount          amount deducted from the subtotal
 *   Final bill total  subtotal - discount + tax + service charge  (salon_bills.grand_total)
 *   Cash collected    only the cash portion actually paid
 *   QR collected      only the online / QR portion actually paid
 *   Cash + QR         always equals the final bill total for a paid bill
 *   Savings transfer  internal fund movement, NOT an operating expense
 */

import { BILL_DATE_EXPR_B, periodBoundsSql, periodDateColumnFilter, periodDateFilter, SALON_TIMEZONE } from '@/lib/db/postgres-dates';
import { getDashboardPeriodMeta, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';

export const PAID_BILL_STATUS_SQL = "LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')";
export const PAID_BILL_STATUS_SQL_SB = "LOWER(COALESCE(sb.status, '')) IN ('paid', 'completed')";

export const SALARY_EXPENSE_CATEGORIES = ['Staff Salary', 'Staff Commission'];

export const DEPOSIT_TYPES = ['BANK_DEPOSIT', 'SAHAKARI_DEPOSIT', 'OTHER_SAVING'];
export const DEPOSIT_SOURCE_ACCOUNTS = ['CASH', 'ESEWA_PHONEPAY', 'BANK_QR', 'OTHER_ONLINE'];

export const DEPOSIT_TYPE_LABELS = {
  BANK_DEPOSIT: 'Bank Deposit',
  SAHAKARI_DEPOSIT: 'Sahakari Deposit',
  OTHER_SAVING: 'Other Saving',
};

export const DEPOSIT_SOURCE_LABELS = {
  CASH: 'Cash',
  ESEWA_PHONEPAY: 'Esewa / PhonePay',
  BANK_QR: 'Bank QR',
  OTHER_ONLINE: 'Other Online',
};

export function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function qrTypeLabel(value) {
  if (value === 'ESEWA_PHONEPAY') return 'Esewa / PhonePay';
  if (value === 'BANK') return 'Bank QR';
  return 'Not recorded';
}

export function paymentMethodLabel(value) {
  if (value === 'cash') return 'Cash';
  if (value === 'online') return 'Online / QR';
  if (value === 'card') return 'Card';
  if (value === 'split') return 'Split';
  return value || 'Not recorded';
}

/**
 * Cash portion actually collected for a bill.
 *
 * The stored cash_amount / qr_amount pair is authoritative whenever it reconciles to
 * grand_total (that is what the billing API writes for cash, online and split bills).
 * Only when a historical row does not reconcile do we fall back to the payment method,
 * and an online / card bill then falls back to ZERO cash — never to the full total.
 */
export function billCashSql(alias = 'b') {
  return `CASE
    WHEN ABS(COALESCE(${alias}.cash_amount, 0) + COALESCE(${alias}.qr_amount, 0) - COALESCE(${alias}.grand_total, 0)) <= 0.01
      THEN COALESCE(${alias}.cash_amount, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) = 'cash' THEN COALESCE(${alias}.grand_total, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) IN ('online', 'card') THEN 0
    ELSE COALESCE(${alias}.cash_amount, 0)
  END`;
}

/** QR / online portion actually collected for a bill. Mirror image of billCashSql. */
export function billQrSql(alias = 'b') {
  return `CASE
    WHEN ABS(COALESCE(${alias}.cash_amount, 0) + COALESCE(${alias}.qr_amount, 0) - COALESCE(${alias}.grand_total, 0)) <= 0.01
      THEN COALESCE(${alias}.qr_amount, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) = 'online' THEN COALESCE(${alias}.grand_total, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) = 'cash' THEN 0
    ELSE COALESCE(${alias}.qr_amount, 0)
  END`;
}

/** Cash portion of an expense row, normalised the same way as bills. */
export function expenseCashSql(alias = 'e') {
  return `CASE
    WHEN ABS(COALESCE(${alias}.cash_amount, 0) + COALESCE(${alias}.online_amount, 0) - COALESCE(${alias}.amount, 0)) <= 0.01
      THEN COALESCE(${alias}.cash_amount, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) = 'cash' THEN COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

/** Online / bank portion of an expense row. */
export function expenseOnlineSql(alias = 'e') {
  return `CASE
    WHEN ABS(COALESCE(${alias}.cash_amount, 0) + COALESCE(${alias}.online_amount, 0) - COALESCE(${alias}.amount, 0)) <= 0.01
      THEN COALESCE(${alias}.online_amount, 0)
    WHEN LOWER(COALESCE(${alias}.payment_method, '')) IN ('online', 'bank_transfer') THEN COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

const SALARY_CATEGORY_SQL = SALARY_EXPENSE_CATEGORIES.map((category) => `'${category}'`).join(', ');

/**
 * Period-scoped sales totals straight from salon_bills.
 * Bill-level money is aggregated here only — never joined against salon_bill_items,
 * which would multiply every total by the number of line items.
 */
export async function getSalesTotals(db, period, options = {}) {
  const billFilter = periodDateFilter(period, options.startDate, options.endDate, BILL_DATE_EXPR_B);
  const cash = billCashSql('b');
  const qr = billQrSql('b');

  const row = await db.get(`
    SELECT
      COUNT(b.id)::int AS bills,
      COALESCE(SUM(b.subtotal), 0) AS gross_sales_before_discount,
      COALESCE(SUM(b.discount_amount), 0) AS total_discounts,
      COALESCE(SUM(b.tax), 0) AS total_tax,
      COALESCE(SUM(b.service_charge), 0) AS total_service_charge,
      COALESCE(SUM(b.grand_total), 0) AS net_sales_after_discount,
      COALESCE(SUM(${cash}), 0) AS gross_cash_collected,
      COALESCE(SUM(${qr}), 0) AS gross_qr_collected,
      COALESCE(SUM(CASE WHEN b.qr_type = 'ESEWA_PHONEPAY' THEN ${qr} ELSE 0 END), 0) AS esewa_phonepay_collected,
      COALESCE(SUM(CASE WHEN b.qr_type = 'BANK' THEN ${qr} ELSE 0 END), 0) AS bank_qr_collected,
      COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${cash} ELSE 0 END), 0) AS split_cash,
      COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${qr} ELSE 0 END), 0) AS split_qr
    FROM salon_bills b
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, billFilter.params);

  const grossSalesBeforeDiscount = numeric(row?.gross_sales_before_discount);
  const totalDiscounts = numeric(row?.total_discounts);
  const netSalesAfterDiscount = numeric(row?.net_sales_after_discount);
  const grossCashCollected = numeric(row?.gross_cash_collected);
  const grossQrCollected = numeric(row?.gross_qr_collected);

  return {
    bills: Number(row?.bills || 0),
    grossSalesBeforeDiscount,
    totalDiscounts,
    totalTax: numeric(row?.total_tax),
    totalServiceCharge: numeric(row?.total_service_charge),
    netSalesAfterDiscount,
    grossCashCollected,
    grossQrCollected,
    grossTotalCollected: grossCashCollected + grossQrCollected,
    esewaPhonePayCollected: numeric(row?.esewa_phonepay_collected),
    bankQrCollected: numeric(row?.bank_qr_collected),
    splitCash: numeric(row?.split_cash),
    splitQr: numeric(row?.split_qr),
  };
}

/** Period-scoped operating and salary expenses, split by how they were paid. */
export async function getExpenseTotals(db, period, options = {}) {
  const filter = periodDateColumnFilter(period, 'e.expense_date', options.startDate, options.endDate);
  const createdByClause = options.createdBy ? 'AND e.created_by = ?' : '';
  const params = options.createdBy ? [...filter.params, options.createdBy] : filter.params;
  const cash = expenseCashSql('e');
  const online = expenseOnlineSql('e');
  const isSalary = `e.category IN (${SALARY_CATEGORY_SQL})`;

  const row = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN NOT ${isSalary} THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS operating_total,
      COALESCE(SUM(CASE WHEN NOT ${isSalary} THEN ${cash} ELSE 0 END), 0) AS operating_cash,
      COALESCE(SUM(CASE WHEN NOT ${isSalary} THEN ${online} ELSE 0 END), 0) AS operating_online,
      COALESCE(SUM(CASE WHEN ${isSalary} THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS salary_total,
      COALESCE(SUM(CASE WHEN ${isSalary} THEN ${cash} ELSE 0 END), 0) AS salary_cash,
      COALESCE(SUM(CASE WHEN ${isSalary} THEN ${online} ELSE 0 END), 0) AS salary_online
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND ${filter.clause} ${createdByClause}
  `, params);

  return {
    operatingExpenses: numeric(row?.operating_total),
    operatingExpensesCash: numeric(row?.operating_cash),
    operatingExpensesOnline: numeric(row?.operating_online),
    salaryExpenses: numeric(row?.salary_total),
    salaryExpensesCash: numeric(row?.salary_cash),
    salaryExpensesOnline: numeric(row?.salary_online),
  };
}

/** Period-scoped savings transfers, split by the account the money left. */
export async function getSavingsTotals(db, period, options = {}) {
  const filter = periodDateColumnFilter(period, 's.deposit_date', options.startDate, options.endDate);
  const createdByClause = options.createdBy ? 'AND s.created_by = ?' : '';
  const params = options.createdBy ? [...filter.params, options.createdBy] : filter.params;

  const row = await db.get(`
    SELECT
      COALESCE(SUM(s.amount), 0) AS total,
      COALESCE(SUM(CASE WHEN s.source_account = 'CASH' THEN s.amount ELSE 0 END), 0) AS from_cash,
      COALESCE(SUM(CASE WHEN s.source_account <> 'CASH' THEN s.amount ELSE 0 END), 0) AS from_online,
      COALESCE(SUM(CASE WHEN s.deposit_type = 'BANK_DEPOSIT' THEN s.amount ELSE 0 END), 0) AS bank_deposit,
      COALESCE(SUM(CASE WHEN s.deposit_type = 'SAHAKARI_DEPOSIT' THEN s.amount ELSE 0 END), 0) AS sahakari_deposit,
      COALESCE(SUM(CASE WHEN s.deposit_type = 'OTHER_SAVING' THEN s.amount ELSE 0 END), 0) AS other_saving,
      COUNT(s.id)::int AS records
    FROM savings_deposits s
    WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
      AND ${filter.clause} ${createdByClause}
  `, params);

  return {
    savingsTransfers: numeric(row?.total),
    savingsFromCash: numeric(row?.from_cash),
    savingsFromOnline: numeric(row?.from_online),
    bankDeposits: numeric(row?.bank_deposit),
    sahakariDeposits: numeric(row?.sahakari_deposit),
    otherSavings: numeric(row?.other_saving),
    savingsRecords: Number(row?.records || 0),
  };
}

/**
 * Sales trend for the selected period, bucketed by Nepal calendar day (or by hour for Today).
 *
 * The buckets come from generate_series and the bills are LEFT JOINed onto them, so a day with
 * no transactions is returned as a real zero row rather than being dropped. "Last 7 Days"
 * therefore always returns exactly 7 ordered points.
 *
 * Only bill-level columns are aggregated here — salon_bill_items is never joined, which is what
 * would otherwise multiply each day's total by its number of line items.
 */
export async function getSalesSeries(db, periodValue, options = {}) {
  const period = resolveDashboardPeriod(periodValue);
  const bounds = periodBoundsSql(period, options.startDate, options.endDate);
  const cash = billCashSql('b');
  const qr = billQrSql('b');
  const metrics = `
    COALESCE(SUM(b.subtotal), 0) AS gross_sales,
    COALESCE(SUM(b.discount_amount), 0) AS discounts,
    COALESCE(SUM(b.grand_total), 0) AS net_sales,
    COALESCE(SUM(${cash}), 0) AS cash_collected,
    COALESCE(SUM(${qr}), 0) AS qr_collected,
    COUNT(b.id)::int AS bills
  `;

  if (period === 'today') {
    // Hourly buckets, trimmed to the hours that matter: the salon's default trading window,
    // widened to cover any hour that actually has a sale plus the current hour.
    const rows = await db.all(`
      WITH bounds AS (
        SELECT ${bounds.startSql} AS start_date, ${bounds.endSql} AS end_date
      ),
      sales AS (
        SELECT date_part('hour', (COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::int AS hour_of_day,
               ${metrics}
        FROM salon_bills b, bounds bo
        WHERE ${PAID_BILL_STATUS_SQL}
          AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date >= bo.start_date
          AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date < bo.end_date
        GROUP BY hour_of_day
      ),
      window_bounds AS (
        SELECT LEAST(COALESCE(MIN(hour_of_day), 9), 9) AS from_hour,
               GREATEST(
                 COALESCE(MAX(hour_of_day), 20),
                 20,
                 date_part('hour', CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::int
               ) AS to_hour
        FROM sales
      ),
      buckets AS (
        SELECT generate_series(w.from_hour, w.to_hour, 1) AS hour_of_day FROM window_bounds w
      )
      SELECT bk.hour_of_day,
             COALESCE(s.gross_sales, 0) AS gross_sales,
             COALESCE(s.discounts, 0) AS discounts,
             COALESCE(s.net_sales, 0) AS net_sales,
             COALESCE(s.cash_collected, 0) AS cash_collected,
             COALESCE(s.qr_collected, 0) AS qr_collected,
             COALESCE(s.bills, 0)::int AS bills
      FROM buckets bk
      LEFT JOIN sales s ON s.hour_of_day = bk.hour_of_day
      ORDER BY bk.hour_of_day
    `, bounds.params);

    return rows.map((row) => {
      const hour = Number(row.hour_of_day || 0);
      const suffix = hour < 12 ? 'AM' : 'PM';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return {
        bucket: String(hour).padStart(2, '0'),
        label: `${display} ${suffix}`,
        grossSales: numeric(row.gross_sales),
        discounts: numeric(row.discounts),
        netSales: numeric(row.net_sales),
        cashCollected: numeric(row.cash_collected),
        qrCollected: numeric(row.qr_collected),
        bills: Number(row.bills || 0),
      };
    });
  }

  const rows = await db.all(`
    WITH bounds AS (
      SELECT ${bounds.startSql} AS start_date, ${bounds.endSql} AS end_date
    ),
    days AS (
      SELECT generate_series(bo.start_date::date, (bo.end_date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
      FROM bounds bo
    )
    -- Cast to text: a DATE would come back as a local-midnight Date object and reformatting
    -- that through any timezone shifts the label onto the wrong calendar day.
    SELECT d.day::text AS day, ${metrics}
    FROM days d
    LEFT JOIN salon_bills b
      ON ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date = d.day
     AND ${PAID_BILL_STATUS_SQL}
    GROUP BY d.day
    ORDER BY d.day
  `, bounds.params);

  return rows.map((row) => {
    const iso = String(row.day).slice(0, 10);
    const [year, month, dayOfMonth] = iso.split('-').map(Number);
    const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, dayOfMonth)));
    return {
      bucket: iso,
      date: iso,
      label,
      grossSales: numeric(row.gross_sales),
      discounts: numeric(row.discounts),
      netSales: numeric(row.net_sales),
      cashCollected: numeric(row.cash_collected),
      qrCollected: numeric(row.qr_collected),
      bills: Number(row.bills || 0),
    };
  });
}

/**
 * The complete financial picture for one period.
 *
 * Savings reduce the balances that are still on hand, but they are never added to
 * operating expenses and never reduce operating profit.
 */
export async function getFinancialSummary(db, periodValue, options = {}) {
  const period = resolveDashboardPeriod(periodValue);
  const [sales, expenses, savings] = await Promise.all([
    getSalesTotals(db, period, options),
    getExpenseTotals(db, period, options),
    getSavingsTotals(db, period, options),
  ]);

  const includeSalary = options.includeSalary !== false;
  const salaryExpenses = includeSalary ? expenses.salaryExpenses : 0;
  const salaryExpensesCash = includeSalary ? expenses.salaryExpensesCash : 0;
  const salaryExpensesOnline = includeSalary ? expenses.salaryExpensesOnline : 0;

  // Physical notes in the drawer: only cash inflows and cash outflows move this number.
  const netCashInHand =
    sales.grossCashCollected
    - expenses.operatingExpensesCash
    - salaryExpensesCash
    - savings.savingsFromCash;

  // Online / QR account balance: only online inflows and online outflows move this number.
  const netOnlineBalance =
    sales.grossQrCollected
    - expenses.operatingExpensesOnline
    - salaryExpensesOnline
    - savings.savingsFromOnline;

  const netAvailableBalance =
    sales.grossTotalCollected
    - expenses.operatingExpenses
    - salaryExpenses
    - savings.savingsTransfers;

  return {
    period: getDashboardPeriodMeta(period, options.startDate, options.endDate),
    ...sales,
    operatingExpenses: expenses.operatingExpenses,
    operatingExpensesCash: expenses.operatingExpensesCash,
    operatingExpensesOnline: expenses.operatingExpensesOnline,
    salaryExpenses,
    salaryExpensesCash,
    salaryExpensesOnline,
    ...savings,
    netCashInHand,
    netOnlineBalance,
    netAvailableBalance,
  };
}
