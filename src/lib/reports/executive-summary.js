/**
 * ADMIN EXECUTIVE SUMMARY — one grouped financial + operational report for a period.
 *
 * This module NEVER re-implements salon money maths. Every rupee figure comes from
 * `getFinancialSummary` (the shared source of truth in finance-summary.js); the queries
 * here only add the breakdowns that summary does not carry: category mixes, staff, tokens,
 * activity counts and the physical drawer reconciliation from Business Day / Store Session.
 *
 * Scoping rules (identical to the dashboards):
 *   period === 'today' + an open/current Business Day -> business_day_id scope, so the
 *     figures accumulate across same-day store reopens and reset on a new business day.
 *   every other period -> Nepal calendar dates, so history is never reset or altered.
 *
 * Accounting rules enforced here:
 *   - Revenue is bill-level (salon_bills); item-level tables are aggregated separately so a
 *     multi-line bill can never multiply a total.
 *   - Split cash is already inside gross cash, split QR already inside gross QR.
 *   - Savings transfers reduce balances but are NOT operating expenses and never reduce P&L.
 *   - Salary / commission expenses are separated from operating expenses.
 *   - 'Product Purchase' expenses are shown as a BREAKDOWN of operating expenses, never added
 *     on top of them.
 *   - CASH_TRANSFER rows are non-P&L drawer movements: excluded from expenses, applied only
 *     to the physical cash reconciliation.
 */

import { periodDateColumnFilter, SALON_TIMEZONE } from '@/lib/db/postgres-dates';
import { getDashboardPeriodMeta, resolveDashboardPeriod, salonDateString } from '@/lib/reports/dashboard-period';
import { computeExpectedCash, getOpenSession } from '@/lib/business-day/service';
import {
  DEPOSIT_SOURCE_LABELS,
  DEPOSIT_TYPE_LABELS,
  eventScope,
  expenseCashSql,
  expenseOnlineSql,
  getFinancialSummary,
  numeric,
  PAID_BILL_STATUS_SQL,
  PAID_BILL_STATUS_SQL_SB,
  revenueScope,
  SALARY_EXPENSE_CATEGORIES,
} from '@/lib/reports/finance-summary';

/** Expense category used by this POS for inventory / product restocking payments. */
export const INVENTORY_PURCHASE_CATEGORY = 'Product Purchase';

const SALARY_CATEGORY_SQL = SALARY_EXPENSE_CATEGORIES.map((category) => `'${category}'`).join(', ');
const NEPAL_DATE = (column) => `((${column}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;

function round2(value) {
  return Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
}

function percentOf(part, whole) {
  const total = numeric(whole);
  if (total <= 0) return 0;
  return Math.round((numeric(part) / total) * 1000) / 10;
}

function labelFromKey(value, fallback = 'Not recorded') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Bill / item scope for REVENUE: which business day owns the sale. A backdated Admin bill
 * belongs to the day the service happened, not to the session whose drawer took the money.
 */
function billFilterFor(period, options) {
  return revenueScope('b', period, options);
}

function tokenFilterFor(period, options) {
  if (options.businessDayId) return { clause: 'wt.business_day_id = ?', params: [options.businessDayId] };
  return periodDateColumnFilter(period, 'wt.token_date', options.startDate, options.endDate);
}

function expenseFilterFor(period, options) {
  if (options.businessDayId) return { clause: 'e.business_day_id = ?', params: [options.businessDayId] };
  return periodDateColumnFilter(period, 'e.expense_date', options.startDate, options.endDate);
}

/** Store sessions belonging to the scope, joined to their business day. */
function sessionFilterFor(period, options) {
  if (options.businessDayId) return { clause: 'ss.business_day_id = ?', params: [options.businessDayId] };
  return periodDateColumnFilter(period, 'bd.business_date', options.startDate, options.endDate);
}

/** Tables without a business-day column (inventory, customers) always use calendar dates. */
function calendarFilterFor(period, options, column) {
  return periodDateColumnFilter(period, column, options.startDate, options.endDate);
}

/* ------------------------------------------------------------------ revenue */

async function getRevenueSplit(db, period, options) {
  const filter = billFilterFor(period, options);
  const row = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.subtotal ELSE 0 END), 0) AS service_revenue,
      COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.subtotal ELSE 0 END), 0) AS product_revenue,
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.quantity ELSE 0 END), 0)::int AS services_sold,
      COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.quantity ELSE 0 END), 0)::int AS products_sold,
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.commission_amount ELSE 0 END), 0) AS commission_accrued
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, filter.params);

  return {
    serviceRevenue: round2(row?.service_revenue),
    productRevenue: round2(row?.product_revenue),
    servicesSold: Number(row?.services_sold || 0),
    productsSold: Number(row?.products_sold || 0),
    commissionAccrued: round2(row?.commission_accrued),
  };
}

/**
 * Estimated cost of the products sold, valued at each product's CURRENT purchase price.
 * Historical unit cost is not stored on the bill line, so this is an ESTIMATE and is
 * labelled as one everywhere it is displayed. Services carry no tracked cost at all.
 */
async function getProductCost(db, period, options) {
  const filter = billFilterFor(period, options);
  // Unit cost snapshotted on the bill line when available, else today's purchase price.
  const unitCost = 'COALESCE(i.unit_cost_snapshot, p.purchase_price, 0)';
  const row = await db.get(`
    SELECT
      COALESCE(SUM(i.quantity * ${unitCost}), 0) AS estimated_cost,
      COALESCE(SUM(CASE WHEN ${unitCost} > 0 THEN i.quantity ELSE 0 END), 0)::int AS costed_units,
      COALESCE(SUM(i.quantity), 0)::int AS total_units
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    LEFT JOIN salon_products p ON p.id = i.item_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'product'
  `, filter.params);

  // A void returns its products to stock, so their cost leaves COGS on the void day — the
  // same day the void leaves revenue.
  const voidFilter = eventScope('fc', period, options);
  const voided = await db.get(`
    SELECT COALESCE(SUM(i.quantity * ${unitCost}), 0) AS voided_cost
    FROM financial_corrections fc
    JOIN salon_bill_items i ON i.bill_id = fc.source_id AND i.item_type = 'product'
    LEFT JOIN salon_products p ON p.id = i.item_id
    WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void' AND ${voidFilter.clause}
  `, voidFilter.params);

  const totalUnits = Number(row?.total_units || 0);
  const costedUnits = Number(row?.costed_units || 0);
  return {
    estimatedProductCost: round2(numeric(row?.estimated_cost) - numeric(voided?.voided_cost)),
    costedUnits,
    totalProductUnits: totalUnits,
    // Only claim a cost figure when at least one sold product actually carries a purchase price.
    costTracked: costedUnits > 0,
    costComplete: totalUnits > 0 && costedUnits === totalUnits,
  };
}

/* -------------------------------------------------------------- categories */

async function getServiceCategories(db, period, options) {
  const filter = billFilterFor(period, options);
  const rows = await db.all(`
    SELECT
      COALESCE(NULLIF(TRIM(s.category), ''), 'Uncategorised') AS category,
      COALESCE(SUM(i.quantity), 0)::int AS quantity,
      COALESCE(SUM(i.subtotal), 0) AS revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    LEFT JOIN salon_services s ON s.id = i.item_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'service'
    GROUP BY 1
    ORDER BY revenue DESC, quantity DESC, category ASC
  `, filter.params);

  const total = rows.reduce((sum, row) => sum + numeric(row.revenue), 0);
  return rows.map((row) => ({
    category: row.category,
    quantity: Number(row.quantity || 0),
    revenue: round2(row.revenue),
    percentage: percentOf(row.revenue, total),
  }));
}

async function getProductCategories(db, period, options) {
  const filter = billFilterFor(period, options);
  const rows = await db.all(`
    SELECT
      COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorised') AS category,
      COALESCE(SUM(i.quantity), 0)::int AS quantity,
      COALESCE(SUM(i.subtotal), 0) AS revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    LEFT JOIN salon_products p ON p.id = i.item_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'product'
    GROUP BY 1
    ORDER BY revenue DESC, quantity DESC, category ASC
  `, filter.params);

  const total = rows.reduce((sum, row) => sum + numeric(row.revenue), 0);
  return rows.map((row) => ({
    category: row.category,
    quantity: Number(row.quantity || 0),
    revenue: round2(row.revenue),
    percentage: percentOf(row.revenue, total),
  }));
}

/* ---------------------------------------------------------------- expenses */

async function getExpenseCategories(db, period, options) {
  const filter = expenseFilterFor(period, options);
  const cash = expenseCashSql('e');
  const online = expenseOnlineSql('e');
  const rows = await db.all(`
    SELECT
      e.category,
      COALESCE(SUM(e.amount), 0) AS amount,
      COALESCE(SUM(${cash}), 0) AS cash_amount,
      COALESCE(SUM(${online}), 0) AS online_amount,
      COUNT(e.id)::int AS records
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND e.category NOT IN (${SALARY_CATEGORY_SQL})
      AND ${filter.clause}
    GROUP BY e.category
    ORDER BY amount DESC, e.category ASC
  `, filter.params);

  const total = rows.reduce((sum, row) => sum + numeric(row.amount), 0);
  return rows.map((row) => ({
    category: row.category,
    amount: round2(row.amount),
    cash: round2(row.cash_amount),
    online: round2(row.online_amount),
    records: Number(row.records || 0),
    percentage: percentOf(row.amount, total),
  }));
}

async function getSalaryBreakdown(db, period, options) {
  const filter = expenseFilterFor(period, options);
  const cash = expenseCashSql('e');
  const online = expenseOnlineSql('e');
  const row = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS salary_total,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' THEN ${cash} ELSE 0 END), 0) AS salary_cash,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' THEN ${online} ELSE 0 END), 0) AS salary_online,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Commission' THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS commission_total,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Commission' THEN ${cash} ELSE 0 END), 0) AS commission_cash,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Commission' THEN ${online} ELSE 0 END), 0) AS commission_online,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' AND e.advance_id IS NOT NULL THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS advance_total,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' AND e.advance_id IS NOT NULL THEN ${cash} ELSE 0 END), 0) AS advance_cash,
      COALESCE(SUM(CASE WHEN e.category = 'Staff Salary' AND e.advance_id IS NOT NULL THEN ${online} ELSE 0 END), 0) AS advance_online,
      COUNT(e.id)::int AS records
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND e.category IN (${SALARY_CATEGORY_SQL})
      AND ${filter.clause}
  `, filter.params);

  return {
    salaryPaid: round2(row?.salary_total),
    salaryCash: round2(row?.salary_cash),
    salaryOnline: round2(row?.salary_online),
    commissionPaid: round2(row?.commission_total),
    commissionCash: round2(row?.commission_cash),
    commissionOnline: round2(row?.commission_online),
    // Advances are salary paid EARLY. They are already inside salaryPaid (booked once, when
    // issued); a later settlement only expenses the remainder, so nothing is counted twice.
    advancePaid: round2(row?.advance_total),
    advanceCash: round2(row?.advance_cash),
    advanceOnline: round2(row?.advance_online),
    regularSalaryPaid: round2(numeric(row?.salary_total) - numeric(row?.advance_total)),
    regularSalaryCash: round2(numeric(row?.salary_cash) - numeric(row?.advance_cash)),
    regularSalaryOnline: round2(numeric(row?.salary_online) - numeric(row?.advance_online)),
    records: Number(row?.records || 0),
  };
}

/**
 * Inventory purchases actually PAID for, i.e. 'Product Purchase' expense rows.
 * These rows are already inside operating expenses — this is a breakdown of that total,
 * never an extra outflow. Supplier credit / payables are not modelled by this POS.
 */
async function getInventoryPurchases(db, period, options) {
  const filter = expenseFilterFor(period, options);
  const cash = expenseCashSql('e');
  const online = expenseOnlineSql('e');
  const row = await db.get(`
    SELECT
      COALESCE(SUM(COALESCE(e.amount, 0)), 0) AS total,
      COALESCE(SUM(${cash}), 0) AS cash_amount,
      COALESCE(SUM(${online}), 0) AS online_amount,
      COUNT(e.id)::int AS records
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND e.category = '${INVENTORY_PURCHASE_CATEGORY}'
      AND ${filter.clause}
  `, filter.params);

  // Physical restocking, valued at the product's current purchase price (an estimate:
  // inventory_movements stores no unit cost and carries no business-day column, so it is
  // always read on Nepal calendar dates).
  const stockFilter = calendarFilterFor(period, options, NEPAL_DATE('im.created_at'));
  const categories = await db.all(`
    SELECT
      COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorised') AS category,
      COALESCE(SUM(im.quantity), 0)::int AS quantity,
      COALESCE(SUM(im.quantity * COALESCE(p.purchase_price, 0)), 0) AS estimated_value,
      COUNT(im.id)::int AS records
    FROM inventory_movements im
    JOIN salon_products p ON p.id = im.product_id
    WHERE im.movement_type = 'stock_in' AND ${stockFilter.clause}
    GROUP BY 1
    ORDER BY estimated_value DESC, quantity DESC, category ASC
  `, stockFilter.params);

  const unitsRestocked = categories.reduce((sum, row2) => sum + Number(row2.quantity || 0), 0);
  return {
    totalPurchase: round2(row?.total),
    cashPurchase: round2(row?.cash_amount),
    onlinePurchase: round2(row?.online_amount),
    records: Number(row?.records || 0),
    unitsRestocked,
    categories: categories.map((row2) => ({
      category: row2.category,
      quantity: Number(row2.quantity || 0),
      estimatedValue: round2(row2.estimated_value),
      records: Number(row2.records || 0),
    })),
  };
}

/* ----------------------------------------------------------------- savings */

async function getSavingsBreakdown(db, period, options) {
  const filter = options.businessDayId
    ? { clause: 's.business_day_id = ?', params: [options.businessDayId] }
    : periodDateColumnFilter(period, 's.deposit_date', options.startDate, options.endDate);

  const rows = await db.all(`
    SELECT s.deposit_type, s.source_account, COALESCE(SUM(s.amount), 0) AS amount, COUNT(s.id)::int AS records
    FROM savings_deposits s
    WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE' AND ${filter.clause}
    GROUP BY s.deposit_type, s.source_account
    ORDER BY s.deposit_type ASC
  `, filter.params);

  return rows.map((row) => ({
    depositType: row.deposit_type,
    depositLabel: DEPOSIT_TYPE_LABELS[row.deposit_type] || labelFromKey(row.deposit_type),
    sourceAccount: row.source_account,
    sourceLabel: DEPOSIT_SOURCE_LABELS[row.source_account] || labelFromKey(row.source_account),
    amount: round2(row.amount),
    records: Number(row.records || 0),
  }));
}

/* ------------------------------------------------- cash / drawer position */

/**
 * Non-P&L drawer adjustments booked when the store is opened with a starting float that
 * differs from the previous close (see business-day/service.js). ADD put cash in, REMOVE
 * took cash out; both are excluded from every expense and profit figure.
 */
async function getCashAdjustments(db, period, options) {
  const filter = expenseFilterFor(period, options);
  const row = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN e.reference_number LIKE 'ADD-%' THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS added,
      COALESCE(SUM(CASE WHEN e.reference_number LIKE 'REMOVE-%' THEN COALESCE(e.amount, 0) ELSE 0 END), 0) AS removed,
      COUNT(e.id)::int AS records
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'CASH_TRANSFER'
      AND ${filter.clause}
  `, filter.params);

  const added = round2(row?.added);
  const removed = round2(row?.removed);
  return { added, removed, net: round2(added - removed), records: Number(row?.records || 0) };
}

/**
 * Store Session facts for the scope: the opening float, the last counted drawer and whether
 * every session is closed (only then is a counted-cash comparison meaningful).
 */
async function getSessionFacts(db, period, options) {
  const filter = sessionFilterFor(period, options);
  const totals = await db.get(`
    SELECT
      COUNT(ss.id)::int AS sessions,
      COUNT(CASE WHEN ss.status = 'OPEN' THEN 1 END)::int AS open_sessions,
      COUNT(DISTINCT bd.id)::int AS business_days,
      COALESCE(SUM(ss.cash_difference), 0) AS session_difference,
      MIN(bd.business_date)::text AS first_date,
      MAX(bd.business_date)::text AS last_date
    FROM store_sessions ss
    JOIN business_days bd ON bd.id = ss.business_day_id
    WHERE ${filter.clause}
  `, filter.params);

  const sessions = Number(totals?.sessions || 0);
  if (sessions === 0) {
    return {
      sessions: 0, openSessions: 0, businessDays: 0, startingCash: 0,
      countedCash: null, countedAt: null, allClosed: false,
      sessionDifference: 0, firstDate: null, lastDate: null,
    };
  }

  const first = await db.get(`
    SELECT ss.starting_cash
    FROM store_sessions ss
    JOIN business_days bd ON bd.id = ss.business_day_id
    WHERE ${filter.clause}
    ORDER BY bd.business_date ASC, ss.session_number ASC, ss.id ASC
    LIMIT 1
  `, filter.params);

  // The FINAL closed session carries the authoritative closing snapshot: the figures the
  // cashier actually reconciled against. Never a sum across sessions.
  const lastClosed = await db.get(`
    SELECT ss.expected_cash, ss.counted_cash, ss.cash_difference, ss.closed_at,
           ss.session_number, bd.business_date, to_char(bd.business_date, 'YYYY-MM-DD') AS business_date_text, ss.cash_denominations,
           COALESCE(u.full_name, u.username, '') AS closed_by_name
    FROM store_sessions ss
    JOIN business_days bd ON bd.id = ss.business_day_id
    LEFT JOIN users u ON u.id = ss.closed_by
    WHERE ${filter.clause} AND ss.status = 'CLOSED'
    ORDER BY bd.business_date DESC, ss.session_number DESC, ss.id DESC
    LIMIT 1
  `, filter.params);

  const openSessions = Number(totals?.open_sessions || 0);
  return {
    sessions,
    openSessions,
    businessDays: Number(totals?.business_days || 0),
    startingCash: round2(first?.starting_cash),
    countedCash: lastClosed ? round2(lastClosed.counted_cash) : null,
    snapshotExpectedCash: lastClosed ? round2(lastClosed.expected_cash) : null,
    snapshotDifference: lastClosed ? round2(lastClosed.cash_difference) : null,
    countedAt: lastClosed?.closed_at || null,
    // Last physical count in the scope, even while a later session is still open.
    lastCountedCash: lastClosed ? round2(lastClosed.counted_cash) : null,
    lastCountedDate: lastClosed?.business_date_text || null,
    denominations: lastClosed?.cash_denominations || null,
    closedBy: lastClosed?.closed_by_name || '',
    finalSessionNumber: lastClosed ? Number(lastClosed.session_number || 0) : null,
    allClosed: openSessions === 0 && Boolean(lastClosed),
    sessionDifference: round2(totals?.session_difference),
    firstDate: totals?.first_date ? String(totals.first_date).slice(0, 10) : null,
    lastDate: totals?.last_date ? String(totals.last_date).slice(0, 10) : null,
  };
}

/* -------------------------------------------------------- staff and tokens */

async function getStaffPerformance(db, period, options) {
  const filter = billFilterFor(period, options);
  const rows = await db.all(`
    SELECT
      i.staff_id,
      COALESCE(NULLIF(sp.display_name, ''), u.full_name, u.username, 'Unknown Staff') AS staff_name,
      COALESCE(NULLIF(sp.salon_role, ''), u.role, 'staff') AS staff_role,
      COUNT(i.id)::int AS services_completed,
      COALESCE(SUM(i.quantity), 0)::int AS units,
      COUNT(DISTINCT COALESCE(b.customer_id::text, NULLIF(b.customer_name, ''), b.id::text))::int AS customers_served,
      COALESCE(SUM(i.subtotal), 0) AS revenue,
      COALESCE(SUM(i.commission_amount), 0) AS commission
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    JOIN users u ON u.id = i.staff_id
    LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
    WHERE ${filter.clause}
      AND ${PAID_BILL_STATUS_SQL}
      AND i.item_type = 'service'
      AND i.staff_id IS NOT NULL
    GROUP BY i.staff_id, staff_name, staff_role
    ORDER BY revenue DESC, services_completed DESC, staff_name ASC
  `, filter.params);

  const total = rows.reduce((sum, row) => sum + numeric(row.revenue), 0);
  return rows.map((row) => ({
    staffId: row.staff_id,
    staffName: row.staff_name,
    role: row.staff_role,
    servicesCompleted: Number(row.services_completed || 0),
    units: Number(row.units || 0),
    customersServed: Number(row.customers_served || 0),
    revenue: round2(row.revenue),
    commission: round2(row.commission),
    percentage: percentOf(row.revenue, total),
  }));
}

async function getTokenSummary(db, period, options) {
  const filter = tokenFilterFor(period, options);
  // Converted is counted from the token cohort itself and requires a matching PAID bill, so
  // converted can never exceed generated for the same cohort.
  const row = await db.get(`
    SELECT
      COUNT(DISTINCT wt.id)::int AS generated,
      COUNT(DISTINCT CASE WHEN COALESCE(wt.is_printed, FALSE) = FALSE THEN wt.id END)::int AS digital_tokens,
      COUNT(DISTINCT CASE WHEN COALESCE(wt.is_printed, FALSE) = TRUE THEN wt.id END)::int AS printed_tokens,
      COUNT(DISTINCT CASE WHEN wt.status IN ('CANCELLED', 'NO_SHOW') THEN wt.id END)::int AS cancelled_no_show,
      COUNT(DISTINCT CASE WHEN wt.status = 'CANCELLED' THEN wt.id END)::int AS cancelled,
      COUNT(DISTINCT CASE WHEN wt.status = 'NO_SHOW' THEN wt.id END)::int AS no_show,
      COUNT(DISTINCT CASE WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL THEN wt.id END)::int AS converted,
      COUNT(DISTINCT CASE
        WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL AND COALESCE(sb.is_printed, FALSE) = FALSE THEN sb.id
      END)::int AS digital_bills,
      COUNT(DISTINCT CASE
        WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL AND COALESCE(sb.is_printed, FALSE) = TRUE THEN sb.id
      END)::int AS printed_bills
    FROM walk_in_tokens wt
    LEFT JOIN salon_bills sb
      ON sb.id = wt.invoice_id
     AND sb.token_id = wt.id
     AND ${PAID_BILL_STATUS_SQL_SB}
    WHERE ${filter.clause}
  `, filter.params);

  const waiting = options.businessDayId
    ? await db.get(
      `SELECT COUNT(*)::int AS waiting FROM walk_in_tokens wt WHERE wt.business_day_id = ? AND wt.status = 'WAITING'`,
      [options.businessDayId]
    )
    : await db.get(
      `SELECT COUNT(*)::int AS waiting FROM walk_in_tokens wt WHERE wt.token_date = ?::date AND wt.status = 'WAITING'`,
      [salonDateString()]
    );

  return {
    generated: Number(row?.generated || 0),
    digitalTokens: Number(row?.digital_tokens || 0),
    printedTokens: Number(row?.printed_tokens || 0),
    converted: Number(row?.converted || 0),
    cancelledNoShow: Number(row?.cancelled_no_show || 0),
    cancelled: Number(row?.cancelled || 0),
    noShow: Number(row?.no_show || 0),
    waitingNow: Number(waiting?.waiting || 0),
    digitalBills: Number(row?.digital_bills || 0),
    printedBills: Number(row?.printed_bills || 0),
  };
}

/* -------------------------------------------------------------- quantities */

async function getActivityCounts(db, period, options) {
  const billFilter = billFilterFor(period, options);
  const bills = await db.get(`
    SELECT
      COUNT(b.id)::int AS bills,
      COUNT(DISTINCT b.customer_id)::int AS saved_customers,
      COUNT(CASE WHEN b.customer_id IS NULL THEN 1 END)::int AS anonymous_bills,
      COUNT(CASE WHEN b.token_id IS NOT NULL THEN 1 END)::int AS token_bills,
      COUNT(CASE WHEN b.token_id IS NULL THEN 1 END)::int AS direct_bills,
      COUNT(CASE WHEN COALESCE(b.is_printed, FALSE) = TRUE THEN 1 END)::int AS printed_bills,
      COUNT(DISTINCT b.cashier_id)::int AS cashiers_active
    FROM salon_bills b
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, billFilter.params);

  const cancelled = await db.get(`
    SELECT COUNT(b.id)::int AS cancelled
    FROM salon_bills b
    WHERE ${billFilter.clause} AND LOWER(COALESCE(b.status, '')) = 'cancelled'
  `, billFilter.params);

  const expenseFilter = expenseFilterFor(period, options);
  const expenseCounts = await db.get(`
    SELECT
      COUNT(CASE WHEN e.category NOT IN (${SALARY_CATEGORY_SQL}) THEN 1 END)::int AS expense_records,
      COUNT(CASE WHEN e.category IN (${SALARY_CATEGORY_SQL}) THEN 1 END)::int AS salary_records
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND ${expenseFilter.clause}
  `, expenseFilter.params);

  const customerFilter = calendarFilterFor(period, options, NEPAL_DATE('c.created_at'));
  const newCustomers = await db.get(`
    SELECT COUNT(c.id)::int AS new_customers FROM customers c WHERE ${customerFilter.clause}
  `, customerFilter.params);

  return {
    bills: Number(bills?.bills || 0),
    cancelledBills: Number(cancelled?.cancelled || 0),
    tokenBills: Number(bills?.token_bills || 0),
    directBills: Number(bills?.direct_bills || 0),
    printedBills: Number(bills?.printed_bills || 0),
    savedCustomers: Number(bills?.saved_customers || 0),
    anonymousBills: Number(bills?.anonymous_bills || 0),
    uniqueCustomers: Number(bills?.saved_customers || 0) + Number(bills?.anonymous_bills || 0),
    cashiersActive: Number(bills?.cashiers_active || 0),
    expenseRecords: Number(expenseCounts?.expense_records || 0),
    salaryRecords: Number(expenseCounts?.salary_records || 0),
    newCustomers: Number(newCustomers?.new_customers || 0),
  };
}

/* ------------------------------------------------------------ orchestration */

/**
 * One grouped Executive Summary payload. All queries are period-scoped and run per section —
 * there is no per-row fetching anywhere, and no query is issued twice.
 */
export async function getExecutiveSummary(db, periodValue, options = {}) {
  const period = resolveDashboardPeriod(periodValue);
  const startDate = options.startDate || null;
  const endDate = options.endDate || null;
  // Only the current day follows the Business Day; history always stays on calendar dates.
  const businessDayId = period === 'today' && options.businessDayId ? options.businessDayId : null;
  const scope = { startDate, endDate, businessDayId };

  // Cashier scope: the management-only sections are never QUERIED, so their figures cannot
  // reach a cashier response at all. Everything both roles are allowed to see is produced by
  // the very same functions and SQL below, which is what keeps the two reports reconciled.
  const forAdmin = options.scope !== 'cashier';

  const [
    financial, revenueSplit, serviceCategories, productCategories,
    savingsBreakdown, cashAdjustments, sessionFacts, tokens, activity, creditOutstanding,
  ] = await Promise.all([
    // includeSalary stays TRUE for both roles: cash salary physically leaves the drawer, so
    // excluding it would make the cashier's Expected Cash in Drawer disagree with the admin's
    // and with the Close Store reconciliation. The salary BREAKDOWN is withheld below.
    getFinancialSummary(db, period, { ...scope, includeSalary: true }),
    getRevenueSplit(db, period, scope),
    getServiceCategories(db, period, scope),
    getProductCategories(db, period, scope),
    getSavingsBreakdown(db, period, scope),
    getCashAdjustments(db, period, scope),
    getSessionFacts(db, period, scope),
    getTokenSummary(db, period, scope),
    getActivityCounts(db, period, scope),
    db.get('SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM customer_credit_ledger'),
  ]);

  const [productCost, expenseCategories, salary, purchases, staffPerformance] = forAdmin
    ? await Promise.all([
      getProductCost(db, period, scope),
      getExpenseCategories(db, period, scope),
      getSalaryBreakdown(db, period, scope),
      getInventoryPurchases(db, period, scope),
      getStaffPerformance(db, period, scope),
    ])
    : [null, [], null, null, []];

  /* ---- revenue --------------------------------------------------------- */
  const revenue = {
    serviceRevenue: revenueSplit.serviceRevenue,
    productRevenue: revenueSplit.productRevenue,
    itemRevenue: round2(revenueSplit.serviceRevenue + revenueSplit.productRevenue),
    grossSalesBeforeDiscount: round2(financial.grossSalesBeforeDiscount),
    totalDiscounts: round2(financial.totalDiscounts),
    loyaltyDiscounts: round2(financial.loyaltyDiscounts),
    totalTax: round2(financial.totalTax),
    totalServiceCharge: round2(financial.totalServiceCharge),
    finalizedBillTotal: round2(financial.finalizedBillTotal),
    // Voids PROCESSED in this period (the bills may have been sold earlier).
    voidedSales: round2(financial.voidedSales),
    voidCount: Number(financial.voidCount || 0),
    creditSales: round2(financial.creditSales),
    netSales: round2(financial.netSalesAfterDiscount),
    bills: Number(financial.bills || 0),
    avgBill: financial.bills > 0 ? round2(numeric(financial.finalizedBillTotal) / financial.bills) : 0,
    servicesSold: revenueSplit.servicesSold,
    productsSold: revenueSplit.productsSold,
    discountRate: percentOf(financial.totalDiscounts, financial.grossSalesBeforeDiscount),
  };

  /* ---- payments -------------------------------------------------------- */
  const payments = {
    grossCashCollected: round2(financial.grossCashCollected),
    esewaPhonePay: round2(financial.esewaPhonePayCollected),
    bankQr: round2(financial.bankQrCollected),
    otherQr: round2(
      numeric(financial.grossQrCollected) - numeric(financial.esewaPhonePayCollected) - numeric(financial.bankQrCollected)
    ),
    grossQrCollected: round2(financial.grossQrCollected),
    splitCash: round2(financial.splitCash),
    splitQr: round2(financial.splitQr),
    grossTotalCollected: round2(financial.grossTotalCollected),
    // Money received against earlier customer credit — cash/online in, not a new sale.
    creditCollectionsCash: round2(financial.creditCollectionsCash),
    creditCollectionsOnline: round2(financial.creditCollectionsOnline),
    cashRefunds: round2(financial.cashRefunds),
    onlineRefunds: round2(financial.onlineRefunds),
    netCashReceived: round2(financial.netCashIn),
    netOnlineReceived: round2(financial.netOnlineIn),
    netReceived: round2(numeric(financial.netCashIn) + numeric(financial.netOnlineIn)),
    // Bill collections less the part of the billed total actually due now (billed - credit).
    // A paid bill always reconciles cash + QR + credit to grand_total, so the only
    // legitimate cause of a gap is a backdated bill: its cash lands in this period while its
    // revenue belongs to an earlier business day.
    collectionVariance: round2(
      numeric(financial.grossTotalCollected) - (numeric(financial.finalizedBillTotal) - numeric(financial.creditSales))
    ),
    backdatedCollected: round2(financial.backdatedCollected),
    backdatedBills: Number(financial.backdatedBills || 0),
    cashShare: percentOf(financial.grossCashCollected, financial.grossTotalCollected),
    qrShare: percentOf(financial.grossQrCollected, financial.grossTotalCollected),
  };

  /* ---- expenses / salary / savings ------------------------------------- */
  // Operating expenses only — salary, commission and savings are never inside this total.
  // The category breakdown is attached for admin only (see the return below).
  const expenses = {
    total: round2(financial.operatingExpenses),
    cash: round2(financial.operatingExpensesCash),
    online: round2(financial.operatingExpensesOnline),
    records: activity.expenseRecords,
  };

  const savings = {
    total: round2(financial.savingsTransfers),
    fromCash: round2(financial.savingsFromCash),
    fromOnline: round2(financial.savingsFromOnline),
    bankDeposits: round2(financial.bankDeposits),
    sahakariDeposits: round2(financial.sahakariDeposits),
    otherSavings: round2(financial.otherSavings),
    records: Number(financial.savingsRecords || 0),
    breakdown: savingsBreakdown,
  };

  // Salary cash always drives the drawer maths; the itemised block is admin-only.
  const salaryCash = round2(financial.salaryExpensesCash);
  const salaryOnline = round2(financial.salaryExpensesOnline);
  const salaryBlock = forAdmin ? {
    ...salary,
    totalPaid: round2(financial.salaryExpenses),
    totalCash: salaryCash,
    totalOnline: salaryOnline,
    commissionAccrued: revenueSplit.commissionAccrued,
  } : null;

  /* ---- profit & loss (admin only) -------------------------------------- */
  const profitLoss = forAdmin ? (() => {
    const grossProfit = round2(revenue.netSales - productCost.estimatedProductCost);
    const operatingResult = round2(
      revenue.netSales - productCost.estimatedProductCost - expenses.total - salaryBlock.totalPaid
    );
    return {
      netSales: revenue.netSales,
      estimatedProductCost: productCost.estimatedProductCost,
      costTracked: productCost.costTracked,
      costComplete: productCost.costComplete,
      costedUnits: productCost.costedUnits,
      totalProductUnits: productCost.totalProductUnits,
      grossProfit,
      grossMargin: percentOf(grossProfit, revenue.netSales),
      operatingExpenses: expenses.total,
      salaryExpense: salaryBlock.totalPaid,
      operatingResult,
      operatingMargin: percentOf(operatingResult, revenue.netSales),
      commissionAccrued: revenueSplit.commissionAccrued,
      // "Actual" only when every figure in the calculation is a recorded amount. Any deducted
      // product cost is valued at current purchase price, which makes the result an estimate.
      basis: productCost.costTracked ? 'Estimated' : 'Actual',
      costNote: productCost.costTracked
        ? 'Product cost uses the unit cost recorded on the bill line where available, otherwise the product\'s current purchase price. Voided products are removed from cost on the void day.'
        : 'No purchase price is recorded for the products sold, so no cost of goods is deducted. Service cost is not tracked by this POS.',
    };
  })() : null;

  /* ---- cash position --------------------------------------------------- */
  const cashPaidOut = round2(expenses.cash + salaryCash);
  const cashOut = round2(cashPaidOut + savings.fromCash + payments.cashRefunds);
  // Cash MOVEMENT statement for the period (not a drawer balance): everything that moved
  // physical cash, including non-P&L drawer adjustments made at Store Open.
  const netCashMovement = round2(numeric(financial.netCashMovement) + cashAdjustments.net);

  // The drawer: an OPEN session is computed live by the one Expected Cash formula that Close
  // Store also uses (computeExpectedCash), so this report can never disagree with the
  // Opening & Closing screen. Rebuilding it from the first session's float would count
  // opening adjustments twice and ignore an earlier session's shortage or overage.
  // CLOSED sessions -> the PERSISTED closing snapshot is authoritative. Reading it back rather
  // than recomputing is what stops a historical report from drifting when an unrelated record
  // is edited later, and it is why admin and cashier always report the identical close.
  const openSession = sessionFacts.openSessions > 0 ? await getOpenSession(db) : null;
  const liveDrawer = openSession ? await computeExpectedCash(db, openSession) : null;
  const liveExpectedCash = liveDrawer ? liveDrawer.expectedCash : null;
  const useSnapshot = !liveDrawer && sessionFacts.allClosed && sessionFacts.snapshotExpectedCash !== null;
  const expectedCash = liveDrawer ? liveExpectedCash : useSnapshot ? sessionFacts.snapshotExpectedCash : null;
  const countedCash = sessionFacts.allClosed ? sessionFacts.countedCash : null;
  const cashDifference = useSnapshot
    ? sessionFacts.snapshotDifference
    : countedCash === null || expectedCash === null ? null : round2(countedCash - expectedCash);

  const cashPosition = {
    hasSessionData: sessionFacts.sessions > 0,
    sessions: sessionFacts.sessions,
    openSessions: sessionFacts.openSessions,
    businessDays: sessionFacts.businessDays,
    startingCash: sessionFacts.startingCash,
    cashCollected: payments.grossCashCollected,
    creditCollectionsCash: payments.creditCollectionsCash,
    cashRefunds: payments.cashRefunds,
    cashExpenses: expenses.cash,
    // Combined outflow so the drawer reconciles without naming payroll to a cashier.
    cashPaidOut,
    cashSavings: savings.fromCash,
    cashAdded: cashAdjustments.added,
    cashRemoved: cashAdjustments.removed,
    cashOut,
    // Shortages (-) / overages (+) found at every close in the period. Additive by design.
    sessionDifferences: sessionFacts.sessionDifference,
    netCashMovement,
    liveExpectedCash,
    // The open session's own drawer breakdown (cashier-safe: salary is inside cashExpenses).
    liveDrawer: liveDrawer ? {
      sessionId: openSession.id,
      sessionNumber: Number(openSession.session_number || 0),
      startingCash: liveDrawer.startingCash,
      cashCollections: liveDrawer.cashCollections,
      creditCollectionsCash: liveDrawer.creditCollectionsCash,
      cashRefunds: liveDrawer.cashRefunds,
      cashExpenses: liveDrawer.cashExpenses,
      cashSavingsOut: liveDrawer.cashSavingsOut,
      expectedCash: liveDrawer.expectedCash,
      ...(forAdmin ? { salaryCash: liveDrawer.salaryCash, operatingExpensesCash: liveDrawer.operatingExpensesCash } : {}),
    } : null,
    expectedCash,
    countedCash,
    cashDifference,
    // Where expectedCash came from, so the UI can say so plainly.
    expectedCashSource: liveDrawer ? 'live' : useSnapshot ? 'snapshot' : 'none',
    closedBy: sessionFacts.closedBy,
    finalSessionNumber: sessionFacts.finalSessionNumber,
    reconciliationState: cashDifference === null
      ? 'PENDING'
      : cashDifference === 0 ? 'MATCHED' : cashDifference < 0 ? 'SHORT' : 'OVER',
    countedAt: sessionFacts.countedAt,
    lastCountedCash: sessionFacts.lastCountedCash ?? null,
    lastCountedAt: sessionFacts.countedAt || null,
    lastCountedDate: sessionFacts.lastCountedDate || null,
    denominations: sessionFacts.denominations || null,
    netCashInHand: expectedCash !== null ? expectedCash : netCashMovement,
    // Cash Position board (ledger vs drawer), all summed here so every screen shows the same.
    board: (() => {
      const salesAndCollections = round2(numeric(payments.grossCashCollected) + numeric(payments.creditCollectionsCash));
      const openingAdjustment = round2(cashAdjustments.added - cashAdjustments.removed);
      const ledgerBalance = round2(numeric(sessionFacts.startingCash) + netCashMovement);
      const totalIn = round2(salesAndCollections + cashAdjustments.added);
      // Count differences at close: a shortage is cash that left the drawer, an overage came in.
      const totalOutWithCounts = round2(cashOut + cashAdjustments.removed - numeric(sessionFacts.sessionDifference));
      return {
        salesAndCollections,
        openingAdjustment,
        ledgerBalance,
        ledgerGap: expectedCash === null ? null : round2(ledgerBalance - expectedCash),
        totalIn,
        totalOut: round2(cashOut + cashAdjustments.removed),
        totalOutWithCounts,
        drawerClosing: round2(numeric(sessionFacts.startingCash) + totalIn - totalOutWithCounts),
        closedSessions: sessionFacts.sessions - sessionFacts.openSessions,
      };
    })(),
    // Admin-only itemisation of the combined cash outflow.
    ...(forAdmin ? { cashSalary: salaryCash } : {}),
  };

  /* ---- online / bank position ------------------------------------------ */
  const onlinePosition = {
    openingBalance: null, // an opening online/bank balance is not tracked by this POS
    esewaPhonePay: payments.esewaPhonePay,
    bankQr: payments.bankQr,
    otherOnline: payments.otherQr,
    totalOnlineIn: payments.grossQrCollected,
    creditCollectionsOnline: payments.creditCollectionsOnline,
    onlineExpenses: expenses.online,
    onlinePaidOut: round2(expenses.online + salaryOnline),
    onlineSavings: savings.fromOnline,
    onlineRefunds: payments.onlineRefunds,
    totalOnlineOut: round2(expenses.online + salaryOnline + savings.fromOnline + payments.onlineRefunds),
    netOnlineBalance: round2(financial.netOnlineBalance),
    salesAndCollections: round2(numeric(payments.grossQrCollected) + numeric(payments.creditCollectionsOnline)),
    ...(forAdmin ? { onlineSalary: salaryOnline } : {}),
  };

  /* ---- executive KPIs -------------------------------------------------- */
  const executiveKpis = {
    netSales: revenue.netSales,
    grossCollected: payments.grossTotalCollected,
    netCashInHand: cashPosition.netCashInHand,
    netOnlineBalance: onlinePosition.netOnlineBalance,
    netAvailableBalance: round2(financial.netAvailableBalance),
    ...(forAdmin ? { netProfit: profitLoss.operatingResult } : {}),
  };

  /* ---- quantity / activity --------------------------------------------- */
  const quantities = {
    servicesSold: revenue.servicesSold,
    productsSold: revenue.productsSold,
    bills: revenue.bills,
    cancelledBills: activity.cancelledBills,
    tokenBills: activity.tokenBills,
    directBills: activity.directBills,
    uniqueCustomers: activity.uniqueCustomers,
    savedCustomers: activity.savedCustomers,
    anonymousBills: activity.anonymousBills,
    newCustomers: activity.newCustomers,
    tokensGenerated: tokens.generated,
    tokenConversions: tokens.converted,
    expenseRecords: activity.expenseRecords,
    savingsRecords: savings.records,
    cashiersActive: activity.cashiersActive,
    storeSessions: sessionFacts.sessions,
    businessDays: sessionFacts.businessDays,
    // Payroll and inventory record counts are management information.
    ...(forAdmin ? {
      salaryRecords: activity.salaryRecords,
      inventoryPurchaseRecords: purchases.records,
      unitsRestocked: purchases.unitsRestocked,
      staffActive: staffPerformance.length,
    } : {}),
  };

  const payload = {
    scope: forAdmin ? 'admin' : 'cashier',
    generatedAt: new Date().toISOString(),
    period: getDashboardPeriodMeta(period, startDate, endDate),
    businessDay: {
      scoped: Boolean(businessDayId),
      id: businessDayId,
      date: options.businessDate || null,
      status: options.businessDayStatus || null,
      sessions: sessionFacts.sessions,
      openSessions: sessionFacts.openSessions,
      firstDate: sessionFacts.firstDate,
      lastDate: sessionFacts.lastDate,
    },
    executiveKpis,
    revenue,
    payments,
    customerCredit: {
      creditSales: revenue.creditSales,
      collectionsCash: payments.creditCollectionsCash,
      collectionsOnline: payments.creditCollectionsOnline,
      collectionsTotal: round2(payments.creditCollectionsCash + payments.creditCollectionsOnline),
      records: Number(financial.creditCollectionRecords || 0),
      // Receivable balance as of NOW (a ledger balance, not a period movement).
      outstandingNow: round2(creditOutstanding?.balance),
    },
    expenses,
    savings,
    cashPosition,
    onlinePosition,
    serviceCategories,
    productCategories,
    tokens,
    quantities,
    capabilities: {
      customerCredit: true,
      refunds: true,
      supplierCredit: false,
      openingOnlineBalance: false,
      serviceCost: false,
    },
  };

  if (!forAdmin) return payload;

  // Management-only sections. A cashier response never reaches this point, so these values
  // are absent from the payload rather than hidden by the UI.
  return {
    ...payload,
    purchases,
    salary: salaryBlock,
    profitLoss,
    staffPerformance,
    expenses: { ...expenses, categories: expenseCategories },
    capabilities: { ...payload.capabilities, productCost: productCost.costTracked },
  };
}
