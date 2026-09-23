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

import { BILL_DATE_EXPR, BILL_DATE_EXPR_B, periodBoundsSql, periodDateColumnFilter, periodDateFilter, SALON_TIMEZONE } from '@/lib/db/postgres-dates';
import { getDashboardPeriodMeta, resolveDashboardPeriod } from '@/lib/reports/dashboard-period';

/**
 * Scope a money query either to a physical store session, a whole business day, or —
 * when neither is given — the requested calendar period. Store Session and Business Day
 * scoping is what makes "current day" totals reset when a new Business Day starts and
 * accumulate across the sessions of one day, without touching historical/report queries.
 */
export function billScope(alias, period, options = {}) {
  if (options.storeSessionId) return { clause: `${alias}.store_session_id = ?`, params: [options.storeSessionId] };
  if (options.businessDayId) return { clause: `${alias}.business_day_id = ?`, params: [options.businessDayId] };
  return periodDateFilter(period, options.startDate, options.endDate, alias === 'b' ? BILL_DATE_EXPR_B : BILL_DATE_EXPR);
}

/**
 * Which business day OWNS THE SALE, as opposed to which session took the money.
 *
 * A backdated Admin bill records a service that happened earlier while its cash lands in
 * today's drawer. `business_day_id` is therefore the cash attribution and must NOT be used
 * for revenue, or an old sale would be counted as today's income.
 *
 *   backdated bill  -> revenue_business_day_id only (NULL = belongs to no business day, so
 *                      it is excluded from every business-day revenue figure and is picked
 *                      up by the calendar reports on its real transaction date).
 *   normal bill     -> revenue_business_day_id, falling back to business_day_id so that
 *                      rows written before this column existed behave exactly as before.
 *
 * Calendar periods are unaffected: they always read the real transaction timestamp.
 */
export function revenueScope(alias, period, options = {}) {
  if (options.storeSessionId) return { clause: `${alias}.store_session_id = ?`, params: [options.storeSessionId] };
  if (options.businessDayId) {
    return {
      clause: `(CASE
        WHEN ${alias}.backdated_by IS NOT NULL THEN ${alias}.revenue_business_day_id
        ELSE COALESCE(${alias}.revenue_business_day_id, ${alias}.business_day_id)
      END) = ?`,
      params: [options.businessDayId],
    };
  }
  return periodDateFilter(period, options.startDate, options.endDate, alias === 'b' ? BILL_DATE_EXPR_B : BILL_DATE_EXPR);
}

export function expenseScope(alias, period, options = {}) {
  if (options.storeSessionId) return { clause: `${alias}.store_session_id = ?`, params: [options.storeSessionId] };
  if (options.businessDayId) return { clause: `${alias}.business_day_id = ?`, params: [options.businessDayId] };
  return periodDateColumnFilter(period, `${alias}.expense_date`, options.startDate, options.endDate);
}

export function savingsScope(alias, period, options = {}) {
  if (options.storeSessionId) return { clause: `${alias}.store_session_id = ?`, params: [options.storeSessionId] };
  if (options.businessDayId) return { clause: `${alias}.business_day_id = ?`, params: [options.businessDayId] };
  return periodDateColumnFilter(period, `${alias}.deposit_date`, options.startDate, options.endDate);
}

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
 *
 * Revenue and collections are aggregated under DIFFERENT scopes on purpose: a sale belongs
 * to the business day it happened on, while its cash belongs to the session that took it.
 * For every ordinary bill the two scopes select exactly the same rows, so this only ever
 * diverges for a backdated Admin bill.
 *
 * Bill-level money is aggregated here only — never joined against salon_bill_items, which
 * would multiply every total by the number of line items.
 */
export async function getSalesTotals(db, period, options = {}) {
  const revenueFilter = revenueScope('b', period, options);
  const cashFilter = billScope('b', period, options);
  const cash = billCashSql('b');
  const qr = billQrSql('b');

  const [row, paymentRow] = await Promise.all([
    db.get(`
      SELECT
        COUNT(b.id)::int AS bills,
        COALESCE(SUM(b.subtotal), 0) AS gross_sales_before_discount,
        COALESCE(SUM(b.discount_amount), 0) AS total_discounts,
        COALESCE(SUM(b.tax), 0) AS total_tax,
        COALESCE(SUM(b.service_charge), 0) AS total_service_charge,
        COALESCE(SUM(b.grand_total), 0) AS net_sales_after_discount
      FROM salon_bills b
      WHERE ${revenueFilter.clause} AND ${PAID_BILL_STATUS_SQL}
    `, revenueFilter.params),
    db.get(`
      SELECT
        COUNT(b.id)::int AS paid_bills,
        COALESCE(SUM(${cash}), 0) AS gross_cash_collected,
        COALESCE(SUM(${qr}), 0) AS gross_qr_collected,
        COALESCE(SUM(CASE WHEN b.qr_type = 'ESEWA_PHONEPAY' THEN ${qr} ELSE 0 END), 0) AS esewa_phonepay_collected,
        COALESCE(SUM(CASE WHEN b.qr_type = 'BANK' THEN ${qr} ELSE 0 END), 0) AS bank_qr_collected,
        COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${cash} ELSE 0 END), 0) AS split_cash,
        COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${qr} ELSE 0 END), 0) AS split_qr,
        COALESCE(SUM(CASE WHEN b.backdated_by IS NOT NULL THEN COALESCE(b.grand_total, 0) ELSE 0 END), 0) AS backdated_collected,
        COUNT(CASE WHEN b.backdated_by IS NOT NULL THEN 1 END)::int AS backdated_bills
      FROM salon_bills b
      WHERE ${cashFilter.clause} AND ${PAID_BILL_STATUS_SQL}
    `, cashFilter.params),
  ]);

  const grossSalesBeforeDiscount = numeric(row?.gross_sales_before_discount);
  const totalDiscounts = numeric(row?.total_discounts);
  const netSalesAfterDiscount = numeric(row?.net_sales_after_discount);
  const grossCashCollected = numeric(paymentRow?.gross_cash_collected);
  const grossQrCollected = numeric(paymentRow?.gross_qr_collected);

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
    esewaPhonePayCollected: numeric(paymentRow?.esewa_phonepay_collected),
    bankQrCollected: numeric(paymentRow?.bank_qr_collected),
    splitCash: numeric(paymentRow?.split_cash),
    splitQr: numeric(paymentRow?.split_qr),
    // Collections whose revenue belongs to an earlier business day. Explains any gap
    // between Net Sales and Gross Collected without hiding it.
    backdatedCollected: numeric(paymentRow?.backdated_collected),
    backdatedBills: Number(paymentRow?.backdated_bills || 0),
  };
}

/** Period-scoped operating and salary expenses, split by how they were paid. */
export async function getExpenseTotals(db, period, options = {}) {
  const filter = expenseScope('e', period, options);
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
  const filter = savingsScope('s', period, options);
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
 * The Nepal calendar day a bill REPORTS under.
 *
 * Business-Day-aware: a sale taken at 01:00 on 11 Aug while the store opened on 10 Aug
 * reports under 10 Aug, so the trend chart and the Business Day KPIs cannot disagree.
 * Bills with no business day (legacy rows) and backdated bills with no matching historical
 * day fall back to their real transaction date, which is what the calendar reports use.
 */
const BILL_REPORT_DAY_JOIN = `
  LEFT JOIN business_days rbd
    ON rbd.id = (CASE
      WHEN b.backdated_by IS NOT NULL THEN b.revenue_business_day_id
      ELSE COALESCE(b.revenue_business_day_id, b.business_day_id)
    END)
`;
const BILL_REPORT_DAY = `COALESCE(rbd.business_date, ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date)`;

/**
 * Sales trend for the selected period, bucketed by Business Day (or by hour for Today).
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
    // Current Business Day when one is open, so a cross-midnight session keeps charting
    // under the day it belongs to; otherwise the Nepal calendar day.
    const dayFilter = options.businessDayId
      ? { clause: `${BILL_REPORT_DAY} = (SELECT business_date FROM business_days WHERE id = ?)`, params: [options.businessDayId] }
      : { clause: `${BILL_REPORT_DAY} = (CURRENT_TIMESTAMP AT TIME ZONE '${SALON_TIMEZONE}')::date`, params: [] };

    // Hourly buckets, trimmed to the hours that matter: the salon's default trading window,
    // widened to cover any hour that actually has a sale plus the current hour.
    const rows = await db.all(`
      WITH sales AS (
        SELECT date_part('hour', (COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::int AS hour_of_day,
               ${metrics}
        FROM salon_bills b
        ${BILL_REPORT_DAY_JOIN}
        WHERE ${PAID_BILL_STATUS_SQL} AND ${dayFilter.clause}
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
    `, dayFilter.params);

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
    ),
    -- Resolve each bill to the day it REPORTS under before bucketing. The raw timestamp is
    -- still bounded (widened by a day at each end) so a cross-midnight session is captured
    -- without scanning the whole bill table.
    bill_days AS (
      SELECT
        ${BILL_REPORT_DAY} AS report_day,
        b.id,
        COALESCE(b.subtotal, 0) AS subtotal,
        COALESCE(b.discount_amount, 0) AS discount_amount,
        COALESCE(b.grand_total, 0) AS grand_total,
        ${cash} AS cash_amount,
        ${qr} AS qr_amount
      FROM salon_bills b
      ${BILL_REPORT_DAY_JOIN}
      CROSS JOIN bounds bo
      WHERE ${PAID_BILL_STATUS_SQL}
        AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date >= bo.start_date - INTERVAL '1 day'
        AND ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE '${SALON_TIMEZONE}')::date < bo.end_date + INTERVAL '1 day'
    )
    -- Cast to text: a DATE would come back as a local-midnight Date object and reformatting
    -- that through any timezone shifts the label onto the wrong calendar day.
    SELECT d.day::text AS day,
           COALESCE(SUM(bd.subtotal), 0) AS gross_sales,
           COALESCE(SUM(bd.discount_amount), 0) AS discounts,
           COALESCE(SUM(bd.grand_total), 0) AS net_sales,
           COALESCE(SUM(bd.cash_amount), 0) AS cash_collected,
           COALESCE(SUM(bd.qr_amount), 0) AS qr_collected,
           COUNT(bd.id)::int AS bills
    FROM days d
    LEFT JOIN bill_days bd ON bd.report_day = d.day
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

  // Net CASH MOVEMENT for the period: cash collected less cash paid out.
  //
  // This is NOT "cash in hand": it excludes the starting float that was already in the
  // drawer and any non-P&L drawer transfer. The physical drawer position is
  // `Expected Cash in Drawer`, computed by the Business Day service from the store session
  // (starting cash + this movement + drawer adjustments).
  const netCashMovement =
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

  // Combined outflow totals. A cashier response withholds the salary AMOUNTS but still needs
  // the correct totals, so these are computed here rather than re-derived in the UI — that is
  // what stops a cashier's "Total Cash Outflow" disagreeing with the admin's.
  const totalCashOut = expenses.operatingExpensesCash + salaryExpensesCash + savings.savingsFromCash;
  const totalOnlineOut = expenses.operatingExpensesOnline + salaryExpensesOnline + savings.savingsFromOnline;
  const totalOutflows = expenses.operatingExpenses + salaryExpenses + savings.savingsTransfers;

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
    totalCashOut,
    totalOnlineOut,
    totalOutflows,
    netCashMovement,
    // Kept as an alias so existing consumers keep working. It has always been the cash
    // MOVEMENT, never the drawer balance — new code should read netCashMovement.
    netCashInHand: netCashMovement,
    netOnlineBalance,
    netAvailableBalance,
  };
}
