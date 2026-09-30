import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { mapApiError } from '@/lib/db/api-errors';
import { BILL_DATE_EXPR, BILL_DATE_EXPR_B, periodDateColumnFilter, periodDateFilter } from '@/lib/db/postgres-dates';
import { nepalDateString } from '@/lib/dates/calendar';
import { DASHBOARD_PERIODS } from '@/lib/reports/dashboard-period';
import { currentSalaryMonth, monthStart, nextMonthStart } from '@/lib/payroll/commission';
import { assertExpenseCategory, categoryLabels, listCategories } from '@/lib/expenses/categories';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { assertDrawerCashAvailable, requireOpenSession } from '@/lib/business-day/service';
import {
  applyAdvances,
  cancelAdvance,
  createAdvance,
  getApplicationsForSalary,
  getAdvanceTotals,
  getOutstandingAdvance,
  getOutstandingAdvanceByStaff,
  getStaffAdvances,
  planSettlement,
  releaseApplications,
} from '@/lib/payroll/salary-advances';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Expense categories live in expense_categories (Manage categories on the Expenses page).
// Savings deposits are never an expense — they live in savings_deposits.
const PAYMENT_METHODS = ['cash', 'online', 'bank_transfer', 'mixed'];
const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'];

function today() {
  return nepalDateString();
}

// Salary-month helpers (BS or AD 'YYYY-MM') are shared with the commission module.

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount cannot be negative');
  return Math.round(amount * 100) / 100;
}

function normalizePayment(method, amount, cashAmount, onlineAmount) {
  const paymentMethod = PAYMENT_METHODS.includes(method) ? method : 'cash';
  const total = money(amount);
  let cash = money(cashAmount);
  let online = money(onlineAmount);

  if (paymentMethod === 'cash') {
    cash = total;
    online = 0;
  } else if (paymentMethod === 'online' || paymentMethod === 'bank_transfer') {
    cash = 0;
    online = total;
  } else if (Math.abs((cash + online) - total) > 0.01) {
    throw new Error('Mixed payment cash and online amounts must equal amount paid');
  }

  return { paymentMethod, cash, online };
}

function mapExpense(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    cashAmount: Number(row.cash_amount || 0),
    onlineAmount: Number(row.online_amount || 0),
    paidBy: row.paid_by || '',
    paidTo: row.paid_to || '',
    expenseDate: row.expense_date,
    notes: row.notes || '',
    referenceNumber: row.reference_number || '',
    attachmentUrl: row.attachment_url || '',
    recordType: row.record_type || 'EXPENSE',
    // Where the row came from. Payroll and supplier rows are owned by their own screens and
    // cannot be edited or deleted here, or the advance / settlement / ledger would drift.
    source: row.source || 'manual',
    locked: Boolean(row.source && row.source !== 'manual'),
    advanceId: row.advance_id ? Number(row.advance_id) : null,
    supplierPaymentId: row.supplier_payment_id ? Number(row.supplier_payment_id) : null,
    businessDate: row.business_date || null,
    sessionNumber: row.session_number ? Number(row.session_number) : null,
    createdByName: row.created_by_name || '',
    updatedByName: row.updated_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSalary(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name,
    role: row.salon_role || row.role,
    salaryMonth: row.salary_month,
    baseSalary: Number(row.base_salary || 0),
    commissionEarned: Number(row.commission_earned || 0),
    servicesCompleted: Number(row.services_completed || 0),
    revenueGenerated: Number(row.revenue_generated || 0),
    bonus: Number(row.bonus || 0),
    deduction: Number(row.deduction || 0),
    totalPayable: Number(row.total_payable || 0),
    advanceApplied: Number(row.advance_applied || 0),
    // What was genuinely still owed in cash after the advance was absorbed.
    remainingPayable: Math.max(0, Number(row.total_payable || 0) - Number(row.advance_applied || 0)),
    amountPaid: Number(row.amount_paid || 0),
    remainingBalance: Number(row.remaining_balance || 0),
    paymentMethod: row.payment_method,
    cashAmount: Number(row.cash_amount || 0),
    onlineAmount: Number(row.online_amount || 0),
    paymentStatus: row.payment_status,
    paymentDate: row.payment_date,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EXPENSE_SOURCE_SQL = `CASE
  WHEN e.advance_id IS NOT NULL THEN 'advance'
  WHEN e.supplier_payment_id IS NOT NULL THEN 'supplier'
  WHEN e.reference_number LIKE 'SALARY-%' THEN 'salary'
  WHEN e.reference_number LIKE 'COMMISSION-%' THEN 'commission'
  ELSE 'manual' END`;

const LOCKED_MESSAGE = {
  advance: 'This expense is a salary / commission advance. Cancel or change it from Salary & advances so the advance stays correct.',
  salary: 'This expense was written by a salary settlement. Edit that salary payment instead.',
  commission: 'This expense was written by a salary settlement. Edit that salary payment instead.',
  supplier: 'This expense is a supplier payment. Change it from Suppliers so the supplier ledger stays correct.',
};

async function expenseSource(db, id) {
  const row = await db.get(`SELECT ${EXPENSE_SOURCE_SQL} AS source FROM expenses e WHERE e.id = ?`, [Number(id)]);
  return row?.source || null;
}

function periodOf(searchParams) {
  const period = cleanText(searchParams.get('period'), '');
  if (!period || period === 'all' || !DASHBOARD_PERIODS[period]) return null;
  const startDate = cleanText(searchParams.get('startDate'), '');
  const endDate = cleanText(searchParams.get('endDate'), '');
  if (period === 'custom' && !(startDate && endDate)) return null;
  return { period, startDate, endDate };
}

async function getStaff(db) {
  return db.all(`
    SELECT u.id, u.full_name as name, sp.salon_role as role, COALESCE(sp.base_salary, 0) as "baseSalary",
           COALESCE(sp.pay_type, 'salary') as "payType", COALESCE(sp.commission_percentage, 0) as "commissionPercentage"
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    ORDER BY u.full_name ASC
  `);
}

async function getStaffMonthMetrics(db, staffId, month) {
  return db.get(`
    SELECT COUNT(i.id)::int as "servicesCompleted",
           COALESCE(SUM(i.subtotal), 0) as "revenueGenerated",
           COALESCE(SUM(i.commission_amount), 0) as "commissionEarned"
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
      AND ((${BILL_DATE_EXPR_B}) AT TIME ZONE 'Asia/Kathmandu')::date >= ?::date AND ((${BILL_DATE_EXPR_B}) AT TIME ZONE 'Asia/Kathmandu')::date < ?::date
  `, [staffId, monthStart(month), nextMonthStart(month)]);
}

function buildFilters(searchParams) {
  const clauses = ['e.deleted_at IS NULL', "COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'"];
  const params = [];
  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(e.title ILIKE ? OR e.category ILIKE ? OR e.payment_method ILIKE ? OR e.paid_to ILIKE ? OR e.notes ILIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }
  const category = cleanText(searchParams.get('category'), '');
  if (category && category !== 'all') {
    clauses.push('e.category = ?');
    params.push(category);
  }
  const paymentMethod = cleanText(searchParams.get('paymentMethod'), '');
  if (paymentMethod && paymentMethod !== 'all') {
    clauses.push('e.payment_method = ?');
    params.push(paymentMethod);
  }
  const range = periodOf(searchParams);
  if (range) {
    const filter = periodDateColumnFilter(range.period, 'e.expense_date', range.startDate, range.endDate);
    clauses.push(filter.clause);
    params.push(...filter.params);
  }
  const from = cleanText(searchParams.get('from'), '');
  const to = cleanText(searchParams.get('to'), '');
  if (from) {
    clauses.push('e.expense_date >= ?::date');
    params.push(from);
  }
  if (to) {
    clauses.push('e.expense_date <= ?::date');
    params.push(to);
  }
  const createdBy = Number(searchParams.get('createdBy') || 0);
  if (createdBy) {
    clauses.push('e.created_by = ?');
    params.push(createdBy);
  }
  return { where: clauses.join(' AND '), params };
}

const EXPENSE_SELECT = `
  SELECT e.*, ${EXPENSE_SOURCE_SQL} AS source,
         COALESCE(c.full_name, '') as created_by_name, COALESCE(u.full_name, '') as updated_by_name,
         bd.business_date, ss.session_number
  FROM expenses e
  LEFT JOIN users c ON c.id = e.created_by
  LEFT JOIN users u ON u.id = e.updated_by
  LEFT JOIN business_days bd ON bd.id = e.business_day_id
  LEFT JOIN store_sessions ss ON ss.id = e.store_session_id
`;

/**
 * Server-paged expense list. Every row in range is reachable (there is no hidden cap), and the
 * totals cover the whole filtered range, not only the visible page.
 */
async function getExpenses(db, searchParams, labels) {
  const { where, params } = buildFilters(searchParams);
  const pageSize = [10, 25, 50, 100].includes(Number(searchParams.get('pageSize'))) ? Number(searchParams.get('pageSize')) : 25;
  const totals = await db.get(`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(e.amount), 0) AS amount,
           COALESCE(SUM(e.cash_amount), 0) AS cash, COALESCE(SUM(e.online_amount), 0) AS online
    FROM expenses e WHERE ${where}
  `, params);
  const count = Number(totals?.count || 0);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(searchParams.get('page'), 10) || 1));
  const rows = await db.all(`
    ${EXPENSE_SELECT}
    WHERE ${where}
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, (page - 1) * pageSize]);
  return {
    rows: rows.map((row) => ({ ...mapExpense(row), categoryLabel: labels[row.category] || row.category })),
    pagination: { page, pageSize, total: count, pages },
    totals: { amount: Number(totals?.amount || 0), cash: Number(totals?.cash || 0), online: Number(totals?.online || 0), count },
  };
}

/** Spend by category for the selected period (Overview). */
async function getPeriodBreakdown(db, searchParams, labels) {
  const range = periodOf(searchParams) || { period: 'month' };
  const filter = periodDateColumnFilter(range.period, 'e.expense_date', range.startDate, range.endDate);
  const rows = await db.all(`
    SELECT e.category, COALESCE(SUM(e.amount), 0) AS amount, COUNT(*)::int AS count,
           COALESCE(SUM(e.cash_amount), 0) AS cash, COALESCE(SUM(e.online_amount), 0) AS online
    FROM expenses e
    WHERE e.deleted_at IS NULL AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE' AND ${filter.clause}
    GROUP BY e.category ORDER BY amount DESC
  `, filter.params);
  const bills = periodDateFilter(range.period, range.startDate, range.endDate, BILL_DATE_EXPR);
  const revenue = await db.get(`SELECT COALESCE(SUM(grand_total), 0) AS total FROM salon_bills WHERE status = 'paid' AND ${bills.clause}`, bills.params);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return {
    period: range.period,
    total: Math.round(total * 100) / 100,
    cash: Math.round(rows.reduce((sum, row) => sum + Number(row.cash || 0), 0) * 100) / 100,
    online: Math.round(rows.reduce((sum, row) => sum + Number(row.online || 0), 0) * 100) / 100,
    records: rows.reduce((sum, row) => sum + Number(row.count || 0), 0),
    revenue: Number(revenue?.total || 0),
    byCategory: rows.map((row) => ({ category: row.category, label: labels[row.category] || row.category, amount: Number(row.amount || 0), count: Number(row.count || 0) })),
  };
}

/** One expense with everything linked to it, for the detail panel. */
async function getExpenseDetail(db, id, labels) {
  const row = await db.get(`${EXPENSE_SELECT} WHERE e.id = ?`, [Number(id)]);
  if (!row) return null;
  const expense = { ...mapExpense(row), categoryLabel: labels[row.category] || row.category, deleted: Boolean(row.deleted_at) };
  let advance = null;
  if (row.advance_id) {
    advance = await db.get(`
      SELECT a.id, a.amount, a.applied_amount, a.status, a.payment_date, a.basis, a.override_reason, a.note,
             u.full_name AS staff_name
      FROM salary_advances a JOIN users u ON u.id = a.staff_id WHERE a.id = ?
    `, [row.advance_id]);
  }
  let salary = null;
  const ref = String(row.reference_number || '');
  const match = ref.match(/^(SALARY|COMMISSION)-(\d{4}-\d{2})-(\d+)$/);
  if (match) {
    salary = await db.get(`
      SELECT s.id, s.salary_month, s.total_payable, s.advance_applied, s.amount_paid, s.remaining_balance, s.payment_status,
             u.full_name AS staff_name
      FROM salary_payments s JOIN users u ON u.id = s.staff_id
      WHERE s.staff_id = ? AND s.salary_month = ? AND s.deleted_at IS NULL ORDER BY s.id DESC LIMIT 1
    `, [Number(match[3]), match[2]]);
  }
  return {
    expense,
    advance: advance ? {
      id: Number(advance.id), staffName: advance.staff_name, amount: Number(advance.amount), applied: Number(advance.applied_amount),
      status: advance.status, paymentDate: advance.payment_date, basis: advance.basis, overrideReason: advance.override_reason || '', note: advance.note || '',
    } : null,
    salary: salary ? {
      id: Number(salary.id), staffName: salary.staff_name, salaryMonth: salary.salary_month, totalPayable: Number(salary.total_payable),
      advanceApplied: Number(salary.advance_applied), amountPaid: Number(salary.amount_paid), remainingBalance: Number(salary.remaining_balance), status: salary.payment_status,
    } : null,
  };
}

async function getSalaries(db, searchParams) {
  const clauses = ['s.deleted_at IS NULL'];
  const params = [];
  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(u.full_name ILIKE ? OR sp.salon_role ILIKE ? OR s.salary_month ILIKE ? OR s.payment_status ILIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  const staffId = Number(searchParams.get('staffId') || 0);
  if (staffId) {
    clauses.push('s.staff_id = ?');
    params.push(staffId);
  }
  const salaryMonth = cleanText(searchParams.get('salaryMonth'), '');
  if (salaryMonth) {
    clauses.push('s.salary_month = ?');
    params.push(salaryMonth);
  }
  const paymentStatus = cleanText(searchParams.get('paymentStatus'), '');
  if (paymentStatus && paymentStatus !== 'all') {
    clauses.push('s.payment_status = ?');
    params.push(paymentStatus);
  }
  const paymentMethod = cleanText(searchParams.get('paymentMethod'), '');
  if (paymentMethod && paymentMethod !== 'all') {
    clauses.push('s.payment_method = ?');
    params.push(paymentMethod);
  }
  const range = periodOf(searchParams);
  if (range && !salaryMonth) {
    const filter = periodDateColumnFilter(range.period, 's.payment_date', range.startDate, range.endDate);
    clauses.push(filter.clause);
    params.push(...filter.params);
  }

  const rows = await db.all(`
    SELECT s.*, u.full_name as staff_name, sp.salon_role
    FROM salary_payments s
    JOIN users u ON u.id = s.staff_id
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.salary_month DESC, s.id DESC
    LIMIT 300
  `, params);
  return rows.map(mapSalary);
}

async function getSummary(db) {
  // Nepal dates, and "month" follows Settings → Calendar (BS or AD) like every other report.
  const TODAY_NP = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date`;
  const monthExpense = periodDateColumnFilter('month', 'expense_date').clause;
  const weekExpense = periodDateColumnFilter('this_week', 'expense_date').clause;
  const monthBills = periodDateFilter('month', null, null, BILL_DATE_EXPR).clause;
  const expenseRow = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN expense_date = ${TODAY_NP} AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN ${weekExpense} AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN ${monthExpense} AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) as month,
      COALESCE(SUM(CASE WHEN ${monthExpense} AND category = 'Staff Salary' AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) AS salary_paid,
      COALESCE(SUM(CASE WHEN ${monthExpense} AND category = 'Staff Commission' AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) AS commission_paid,
      COALESCE(SUM(CASE WHEN ${monthExpense} AND category = 'Product Purchase' AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) AS product_purchase,
      COALESCE(SUM(CASE WHEN ${monthExpense} AND category NOT IN ('Staff Salary', 'Staff Commission', 'Product Purchase') AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE' THEN amount ELSE 0 END), 0) AS other_expenses
    FROM expenses WHERE deleted_at IS NULL
  `);
  const revenueRow = await db.get(`
    SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills
    WHERE status = 'paid'
      AND ${monthBills}
  `);
  const pendingRow = await db.get(`
    SELECT COALESCE(SUM(remaining_balance), 0) as total FROM salary_payments
    WHERE deleted_at IS NULL AND payment_status <> 'paid'
  `);
  // Savings transfers are reported for context only — they are never added to expense totals.
  const savingRow = await db.get(`
    SELECT COALESCE(SUM(amount), 0) as total FROM savings_deposits
    WHERE deleted_at IS NULL AND status = 'ACTIVE' AND deposit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date
  `);
  const revenue = Number(revenueRow?.total || 0);
  return {
    totalExpensesToday: Number(expenseRow?.today || 0),
    totalExpensesWeek: Number(expenseRow?.week || 0),
    totalExpensesMonth: Number(expenseRow?.month || 0),
    staffSalaryPaidMonth: Number(expenseRow?.salary_paid || 0),
    commissionPaidMonth: Number(expenseRow?.commission_paid || 0),
    productPurchaseMonth: Number(expenseRow?.product_purchase || 0),
    otherExpensesMonth: Number(expenseRow?.other_expenses || 0),
    dailySavingToday: Number(savingRow?.total || 0),
    pendingSalaryBalance: Number(pendingRow?.total || 0),
    monthlyRevenue: revenue,
    netRevenueAfterExpenses: revenue - Number(expenseRow?.month || 0),
  };
}

async function saveExpense(db, data, userId, scope = {}) {
  const previous = data.id ? await db.get('SELECT category FROM expenses WHERE id = ? AND deleted_at IS NULL', [Number(data.id)]) : null;
  if (data.id && !previous) { const error = new Error('Expense not found'); error.status = 404; throw error; }
  const category = await assertExpenseCategory(db, data.category, { previous: previous?.category || null });
  const amount = money(data.amount);
  const payment = normalizePayment(data.paymentMethod || data.payment_method, amount, data.cashAmount || data.cash_amount, data.onlineAmount || data.online_amount);
  const title = cleanText(data.title, '');
  if (!title) throw new Error('Expense title is required');
  const expenseDate = cleanText(data.expenseDate || data.expense_date, today());
  const notes = cleanText(data.notes, '') || title;
  const recordType = 'EXPENSE';
  const values = [
    title, category, amount, payment.paymentMethod, payment.cash, payment.online,
    cleanText(data.paidBy || data.paid_by, ''), cleanText(data.paidTo || data.paid_to, ''),
    expenseDate, notes, cleanText(data.referenceNumber || data.reference_number, ''),
    cleanText(data.attachmentUrl || data.attachment_url, ''),
  ];
  if (data.id) {
    // Raising the cash part of an existing expense takes more cash out of the drawer, so the
    // increase passes the same drawer check as a new expense.
    const previous = await db.get('SELECT cash_amount FROM expenses WHERE id = ? AND deleted_at IS NULL', [Number(data.id)]);
    const extraCash = Math.round((Number(payment.cash) - Number(previous?.cash_amount || 0)) * 100) / 100;
    if (extraCash > 0) await assertDrawerCashAvailable(db, extraCash, { allowOverdraw: data.allowOverdraw === true, label: 'expense change' });
    await db.run(`
      UPDATE expenses
      SET title = ?, category = ?, amount = ?, payment_method = ?, cash_amount = ?,
          online_amount = ?, paid_by = ?, paid_to = ?, expense_date = ?::date, notes = ?,
          reference_number = ?, attachment_url = ?, record_type = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL
    `, [...values, recordType, userId, Number(data.id)]);
    return Number(data.id);
  }
  // Every cash payout in this module — expense, salary, commission and advance — is written
  // through here, so one guard covers them all: cash cannot leave a drawer that does not hold
  // it. Inside a transaction this sees the rows already inserted by the same settlement, so
  // sequential payouts compound correctly. Updates are skipped (the row is already counted).
  await assertDrawerCashAvailable(db, payment.cash, {
    allowOverdraw: data.allowOverdraw === true,
    label: category === 'Staff Salary' || category === 'Staff Commission' ? 'salary payment' : 'expense',
  });

  const result = await db.run(`
    INSERT INTO expenses (
      title, category, amount, payment_method, cash_amount, online_amount,
      paid_by, paid_to, expense_date, notes, reference_number, attachment_url,
      record_type, created_by, updated_by, business_day_id, store_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [...values, recordType, userId, userId, scope.businessDayId ?? null, scope.storeSessionId ?? null]);
  return result.lastInsertRowid;
}

async function saveSalary(db, data, userId, scope = {}) {
  const staffId = Number(data.staffId || data.staff_id || 0);
  if (!staffId) throw new Error('Select staff member');
  const staff = await db.get(`
    SELECT u.full_name, sp.salon_role, COALESCE(sp.base_salary, 0) as base_salary
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.is_active = TRUE
  `, [staffId]);
  if (!staff) throw new Error('Selected staff was not found');
  const salaryMonth = cleanText(data.salaryMonth || data.salary_month, currentSalaryMonth());
  if (!/^\d{4}-\d{2}$/.test(salaryMonth)) throw new Error('Salary month must be YYYY-MM');
  const metrics = await getStaffMonthMetrics(db, staffId, salaryMonth);
  const baseSalary = money(data.baseSalary ?? data.base_salary ?? staff.base_salary);
  const commissionEarned = money(data.commissionEarned ?? data.commission_earned ?? metrics.commissionEarned);
  const bonus = money(data.bonus);
  const deduction = money(data.deduction);
  const totalPayable = Math.max(0, baseSalary + commissionEarned + bonus - deduction);

  const amountPaid = money(data.amountPaid ?? data.amount_paid);
  const paymentDate = cleanText(data.paymentDate || data.payment_date, today());
  const notes = cleanText(data.notes, '');

  return db.transaction(async (tx) => {
    let salaryId = Number(data.id || 0) || null;

    // Outstanding advances settle against this payroll BEFORE any cash changes hands.
    // Re-saving an existing settlement first RELEASES the advances it previously consumed,
    // so the same advance can never be absorbed twice. Both steps run inside this
    // transaction, so a validation failure below rolls the release back.
    if (salaryId) await releaseApplications(tx, salaryId);
    const outstandingAdvance = await getOutstandingAdvance(tx, staffId);
    const plan = planSettlement(totalPayable, outstandingAdvance);

    // The advance was already paid and expensed, so only the REMAINING payable can be handed
    // over now. This is also what stops an advance larger than the salary from becoming a
    // negative payment: remainingPayable floors at zero and the excess advance simply stays
    // outstanding for the next period.
    if (amountPaid > plan.remainingPayable) {
      // Carries a status so the reason reaches the admin instead of the generic fallback.
      const error = new Error(
        `Amount paid cannot exceed the remaining salary payable of Rs ${plan.remainingPayable.toFixed(2)} `
        + `(gross Rs ${plan.grossPayable.toFixed(2)} less advance applied Rs ${plan.advanceApplied.toFixed(2)}).`
      );
      error.status = 400;
      throw error;
    }
    const remainingBalance = Math.max(0, plan.remainingPayable - amountPaid);
    // Fully absorbed by an advance counts as settled, even though no cash moved today.
    const paymentStatus = remainingBalance <= 0 && (amountPaid > 0 || plan.advanceApplied > 0)
      ? 'paid'
      : amountPaid <= 0 ? 'unpaid' : 'partially_paid';
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new Error('Invalid payment status');
    const payment = normalizePayment(data.paymentMethod || data.payment_method, amountPaid, data.cashAmount || data.cash_amount, data.onlineAmount || data.online_amount);

    if (salaryId) {
      await tx.run(`
        UPDATE salary_payments
        SET staff_id = ?, salary_month = ?, base_salary = ?, commission_earned = ?,
            services_completed = ?, revenue_generated = ?, bonus = ?, deduction = ?,
            total_payable = ?, advance_applied = ?, amount_paid = ?, remaining_balance = ?,
            payment_method = ?, cash_amount = ?, online_amount = ?, payment_status = ?,
            payment_date = ?::date, notes = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
      `, [
        staffId, salaryMonth, baseSalary, commissionEarned,
        metrics.servicesCompleted || 0, metrics.revenueGenerated || 0, bonus, deduction,
        totalPayable, plan.advanceApplied, amountPaid, remainingBalance, payment.paymentMethod,
        payment.cash, payment.online, paymentStatus, paymentDate, notes, userId, salaryId,
      ]);
    } else {
      const result = await tx.run(`
        INSERT INTO salary_payments (
          staff_id, salary_month, base_salary, commission_earned, services_completed,
          revenue_generated, bonus, deduction, total_payable, advance_applied, amount_paid,
          remaining_balance, payment_method, cash_amount, online_amount,
          payment_status, payment_date, notes, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?)
      `, [
        staffId, salaryMonth, baseSalary, commissionEarned,
        metrics.servicesCompleted || 0, metrics.revenueGenerated || 0, bonus, deduction,
        totalPayable, plan.advanceApplied, amountPaid, remainingBalance, payment.paymentMethod,
        payment.cash, payment.online, paymentStatus, paymentDate, notes, userId, userId,
      ]);
      salaryId = result.lastInsertRowid;
    }

    // Attendance is payroll INPUT only: record which attendance figures this settlement was
    // based on (for audit). It changes no amount — bonus/deduction above are what the admin set.
    if (data.attendanceSnapshot && typeof data.attendanceSnapshot === 'object') {
      await tx.run('UPDATE salary_payments SET attendance_snapshot = ?::jsonb WHERE id = ?', [JSON.stringify(data.attendanceSnapshot).slice(0, 20000), salaryId]);
    }

    const salaryReference = `SALARY-${salaryMonth}-${staffId}`;
    const commissionReference = `COMMISSION-${salaryMonth}-${staffId}`;
    await tx.run(`
      UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW()
      WHERE reference_number IN (?, ?) AND deleted_at IS NULL
    `, [userId, salaryReference, commissionReference]);

    if (amountPaid > 0) {
      const salaryExpenseId = await saveExpense(tx, {
        title: `Salary payment - ${staff.full_name} - ${salaryMonth}`,
        category: 'Staff Salary',
        amount: Math.max(0, amountPaid - commissionEarned > 0 ? amountPaid - Math.min(commissionEarned, amountPaid) : 0),
        paymentMethod: payment.paymentMethod,
        cashAmount: payment.paymentMethod === 'mixed' ? Math.max(0, payment.cash - Math.min(payment.cash, commissionEarned)) : undefined,
        onlineAmount: payment.paymentMethod === 'mixed' ? Math.max(0, payment.online - Math.max(0, commissionEarned - payment.cash)) : undefined,
        paidBy: 'Admin',
        paidTo: staff.full_name,
        expenseDate: paymentDate,
        notes,
        referenceNumber: salaryReference,
      }, userId, scope);
      let commissionExpenseId = null;
      const commissionPaid = Math.min(amountPaid, commissionEarned);
      if (commissionPaid > 0) {
        commissionExpenseId = await saveExpense(tx, {
          title: `Commission payment - ${staff.full_name} - ${salaryMonth}`,
          category: 'Staff Commission',
          amount: commissionPaid,
          paymentMethod: payment.paymentMethod,
          cashAmount: payment.paymentMethod === 'mixed' ? Math.min(payment.cash, commissionPaid) : undefined,
          onlineAmount: payment.paymentMethod === 'mixed' ? Math.max(0, commissionPaid - Math.min(payment.cash, commissionPaid)) : undefined,
          paidBy: 'Admin',
          paidTo: staff.full_name,
          expenseDate: paymentDate,
          notes,
          referenceNumber: commissionReference,
        }, userId, scope);
      }
      await tx.run('UPDATE salary_payments SET expense_id = ?, updated_at = NOW() WHERE id = ?', [commissionExpenseId || salaryExpenseId, salaryId]);
    }
    // Consume the advances this settlement absorbed, oldest first, recording which advance
    // funded it. The advance was already expensed when it was paid, so nothing extra is
    // expensed here — that is what keeps salary expense recognised exactly once.
    if (plan.advanceApplied > 0) {
      await applyAdvances(tx, { staffId, salaryPaymentId: salaryId, amountToApply: plan.advanceApplied, userId });
    }
    await logAction(tx, userId, data.id ? 'update' : 'create', 'salary_payment', salaryId, `${staff.full_name} ${salaryMonth}`);
    return salaryId;
  });
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const { searchParams } = new URL(request.url);
    const detailId = Number(searchParams.get('id') || 0);
    if (detailId) {
      // Expense details open from reports too: anyone who may read the Expenses report may see
      // one expense. Salary / advance specifics stay admin-only.
      const viewer = await requirePermission(request, db, PERMISSIONS.REPORTS_VIEW);
      const detail = await getExpenseDetail(db, detailId, await categoryLabels(db));
      if (!detail) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
      if (viewer.role !== 'admin') {
        if (['Staff Salary', 'Staff Commission'].includes(detail.expense.category)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        return NextResponse.json({ ...detail, advance: null, salary: null });
      }
      return NextResponse.json(detail);
    }
    await requireRole(request, db, 'admin');
    const labels = await categoryLabels(db);
    const staffId = Number(searchParams.get('staffId') || 0);
    const salaryMonth = cleanText(searchParams.get('salaryMonth'), currentSalaryMonth());
    const staffList = await getStaff(db);
    const staff = await Promise.all(staffList.map(async (member) => ({
      ...member,
      monthMetrics: staffId && staffId === Number(member.id)
        ? await getStaffMonthMetrics(db, member.id, salaryMonth)
        : undefined,
    })));
    // Payroll advances. `outstandingByStaff` drives the settlement preview on the list;
    // `staffAdvances` is the per-staff ledger shown on the salary detail view.
    const salaries = await getSalaries(db, searchParams);
    const outstandingByStaff = await getOutstandingAdvanceByStaff(db);
    const staffAdvances = staffId ? await getStaffAdvances(db, staffId) : [];
    const advanceTotals = await getAdvanceTotals(db, {
      startDate: cleanText(searchParams.get('from'), '') || null,
      endDate: cleanText(searchParams.get('to'), '') || null,
    });
    // Which advances funded each settlement, so history never loses the link.
    const salariesWithAdvances = await Promise.all(salaries.map(async (row) => ({
      ...row,
      advanceApplications: row.advanceApplied > 0 ? await getApplicationsForSalary(db, row.id) : [],
    })));

    const expensePage = await getExpenses(db, searchParams, labels);
    return NextResponse.json({
      summary: await getSummary(db),
      periodSummary: await getPeriodBreakdown(db, searchParams, labels),
      expenses: expensePage.rows,
      expensePagination: expensePage.pagination,
      expenseTotals: expensePage.totals,
      salaries: salariesWithAdvances,
      staff: staff.map((member) => ({
        ...member,
        outstandingAdvance: outstandingByStaff[String(member.id)]?.outstanding || 0,
        totalAdvanceGiven: outstandingByStaff[String(member.id)]?.totalGiven || 0,
      })),
      staffAdvances,
      advanceTotals,
      categories: (await listCategories(db)).map((category) => category.name),
      categoryList: await listCategories(db, { includeInactive: true }),
      categoryLabels: labels,
      paymentMethods: PAYMENT_METHODS,
      paymentStatuses: PAYMENT_STATUSES,
    });
  } catch (error) {
    console.error('Admin expenses load failed:', error);
    const mapped = mapApiError(error, 'Failed to load expenses');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status }
    );
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const data = await request.json();
    const permission = data.type === 'salary' ? PERMISSIONS.PAYROLL_PAYMENTS_CREATE : data.type === 'advance' ? PERMISSIONS.ADVANCES_CREATE : null;
    const user = permission ? await requirePermission(request, db, permission) : await requireRole(request, db, 'admin');
    const { sessionId, businessDayId } = await requireOpenSession(db);
    const scope = { businessDayId, storeSessionId: sessionId };
    if (data.type === 'salary') {
      const id = await saveSalary(db, data, user.id, scope);
      return NextResponse.json({ message: 'Salary payment saved', id }, { status: 201 });
    }
    if (data.type === 'advance') {
      const key = cleanText(request.headers.get('idempotency-key') || data.idempotencyKey, '');
      if (!key) return NextResponse.json({ error: 'Idempotency-Key is required for an advance' }, { status: 400 });
      const existing = await db.get('SELECT id FROM salary_advances WHERE idempotency_key=?', [key]);
      if (existing) return NextResponse.json({ message: 'Advance salary already recorded', id: existing.id, duplicate: true });
      data.idempotencyKey = key;
      // Only an admin may advance more than the allowance, and only with a written reason.
      const input = { ...data, allowOverride: user.role === 'admin', overrideReason: data.overrideReason };
      const result = await db.transaction(async (tx) => createAdvance(tx, input, user.id, scope, saveExpense));
      await logAction(db, user.id, 'create', 'salary_advance', result.advanceId, `${result.staffName} ${result.amount}`);
      return NextResponse.json({ message: 'Advance salary recorded', id: result.advanceId }, { status: 201 });
    }
    const id = await saveExpense(db, data, user.id, scope);
    await logAction(db, user.id, 'create', 'expense', id, cleanText(data.title, 'Expense'));
    return NextResponse.json({ message: 'Expense saved', id }, { status: 201 });
  } catch (error) {
    console.error('Admin expense save failed:', error);
    const mapped = mapApiError(error, 'Failed to save expense');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status === 500 ? 400 : mapped.status }
    );
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const data = await request.json();
    const user = data.type === 'salary'
      ? await requirePermission(request, db, PERMISSIONS.PAYROLL_RECORDS_CORRECT)
      : await requireRole(request, db, 'admin');
    if (data.type === 'salary') {
      const id = await saveSalary(db, data, user.id);
      return NextResponse.json({ message: 'Salary payment updated', id });
    }
    if (!data.id) return NextResponse.json({ error: 'Expense ID is required' }, { status: 400 });
    const source = await expenseSource(db, data.id);
    if (source && source !== 'manual') return NextResponse.json({ error: LOCKED_MESSAGE[source] }, { status: 409 });
    const id = await saveExpense(db, data, user.id);
    await logAction(db, user.id, 'update', 'expense', id, cleanText(data.title, 'Expense'));
    return NextResponse.json({ message: 'Expense updated', id });
  } catch (error) {
    console.error('Admin expense update failed:', error);
    const mapped = mapApiError(error, 'Failed to update expense');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status === 500 ? 400 : mapped.status }
    );
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || 0);
    const type = cleanText(searchParams.get('type'), 'expense');
    const user = ['salary','advance'].includes(type)
      ? await requirePermission(request, db, PERMISSIONS.PAYROLL_RECORDS_DELETE)
      : await requireRole(request, db, 'admin');
    if (!id) return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    if (type === 'advance') {
      // Deleting a salary settlement releases its advance applications first, so an advance
      // is only cancellable while nothing has been deducted from it.
      const reason = cleanText(searchParams.get('reason'), '');
      const result = await db.transaction(async (tx) => cancelAdvance(tx, { advanceId: id, reason, userId: user.id }));
      await logAction(db, user.id, 'cancel', 'salary_advance', id, `Cancelled ${result.amount}`);
      return NextResponse.json({ message: 'Advance cancelled and the payment reversed' });
    }
    if (type === 'salary') {
      // One transaction: release the advances this settlement absorbed (back to OUTSTANDING),
      // remove the settlement and the expense rows it wrote. A failure leaves nothing half-done.
      await db.transaction(async (tx) => {
        const salary = await tx.get('SELECT staff_id, salary_month FROM salary_payments WHERE id = ? AND deleted_at IS NULL', [id]);
        if (!salary) { const error = new Error('Salary payment not found'); error.status = 404; throw error; }
        await releaseApplications(tx, id);
        await tx.run('UPDATE salary_payments SET deleted_at = NOW(), updated_by = ?, updated_at = NOW(), advance_applied = 0 WHERE id = ?', [user.id, id]);
        await tx.run(`
          UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW()
          WHERE reference_number IN (?, ?) AND deleted_at IS NULL
        `, [user.id, `SALARY-${salary.salary_month}-${salary.staff_id}`, `COMMISSION-${salary.salary_month}-${salary.staff_id}`]);
      });
    } else {
      const source = await expenseSource(db, id);
      if (!source) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
      if (source !== 'manual') return NextResponse.json({ error: LOCKED_MESSAGE[source] }, { status: 409 });
      await db.run('UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [user.id, id]);
    }
    await logAction(db, user.id, 'delete', type === 'salary' ? 'salary_payment' : 'expense', id, 'Soft deleted');
    return NextResponse.json({ message: 'Record deleted' });
  } catch (error) {
    console.error('Admin expense delete failed:', error);
    const mapped = mapApiError(error, 'Failed to delete record');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status === 500 ? 400 : mapped.status }
    );
  }
}
