import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { BILL_DATE_EXPR, BILL_DATE_EXPR_B, currentWeekStartSql } from '@/lib/db/postgres-dates';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPENSE_CATEGORIES = [
  'Staff Salary', 'Staff Commission', 'Product Purchase', 'Rent', 'Electricity',
  'Water', 'Internet', 'Maintenance', 'Marketing', 'Equipment', 'Cleaning', 'Other',
];
const PAYMENT_METHODS = ['cash', 'online', 'bank_transfer', 'mixed'];
const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(month) {
  return `${month}-01`;
}

function nextMonthStart(month) {
  const [year, value] = String(month).split('-').map(Number);
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10);
}

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

async function getStaff(db) {
  return db.all(`
    SELECT u.id, u.full_name as name, sp.salon_role as role, COALESCE(sp.base_salary, 0) as baseSalary
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    ORDER BY u.full_name ASC
  `);
}

async function getStaffMonthMetrics(db, staffId, month) {
  return db.get(`
    SELECT COUNT(i.id)::int as servicesCompleted,
           COALESCE(SUM(i.subtotal), 0) as revenueGenerated,
           COALESCE(SUM(i.commission_amount), 0) as commissionEarned
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
      AND (${BILL_DATE_EXPR_B}) >= ?::date AND (${BILL_DATE_EXPR_B}) < ?::date
  `, [staffId, monthStart(month), nextMonthStart(month)]);
}

function buildFilters(searchParams) {
  const clauses = ['e.deleted_at IS NULL'];
  const params = [];
  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(e.title LIKE ? OR e.category LIKE ? OR e.payment_method LIKE ? OR e.paid_to LIKE ? OR e.notes LIKE ?)');
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

async function getExpenses(db, searchParams) {
  const { where, params } = buildFilters(searchParams);
  const rows = await db.all(`
    SELECT e.*, COALESCE(c.full_name, '') as created_by_name, COALESCE(u.full_name, '') as updated_by_name
    FROM expenses e
    LEFT JOIN users c ON c.id = e.created_by
    LEFT JOIN users u ON u.id = e.updated_by
    WHERE ${where}
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 300
  `, params);
  return rows.map(mapExpense);
}

async function getSalaries(db, searchParams) {
  const clauses = ['s.deleted_at IS NULL'];
  const params = [];
  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(u.full_name LIKE ? OR sp.salon_role LIKE ? OR s.salary_month LIKE ? OR s.payment_status LIKE ?)');
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
  const expenseRow = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN expense_date = CURRENT_DATE THEN amount ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN expense_date >= ${currentWeekStartSql()} AND expense_date < ${currentWeekStartSql()} + INTERVAL '7 days' THEN amount ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN expense_date >= date_trunc('month', CURRENT_DATE)::date AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date THEN amount ELSE 0 END), 0) as month,
      COALESCE(SUM(CASE WHEN expense_date >= date_trunc('month', CURRENT_DATE)::date AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AND category = 'Staff Salary' THEN amount ELSE 0 END), 0) as salaryPaid,
      COALESCE(SUM(CASE WHEN expense_date >= date_trunc('month', CURRENT_DATE)::date AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AND category = 'Staff Commission' THEN amount ELSE 0 END), 0) as commissionPaid,
      COALESCE(SUM(CASE WHEN expense_date >= date_trunc('month', CURRENT_DATE)::date AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AND category = 'Product Purchase' THEN amount ELSE 0 END), 0) as productPurchase,
      COALESCE(SUM(CASE WHEN expense_date >= date_trunc('month', CURRENT_DATE)::date AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AND category NOT IN ('Staff Salary', 'Staff Commission', 'Product Purchase') THEN amount ELSE 0 END), 0) as otherExpenses
    FROM expenses WHERE deleted_at IS NULL
  `);
  const revenueRow = await db.get(`
    SELECT COALESCE(SUM(grand_total), 0) as total FROM salon_bills
    WHERE status = 'paid'
      AND (${BILL_DATE_EXPR}) >= date_trunc('month', CURRENT_DATE)
      AND (${BILL_DATE_EXPR}) < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  `);
  const pendingRow = await db.get(`
    SELECT COALESCE(SUM(remaining_balance), 0) as total FROM salary_payments
    WHERE deleted_at IS NULL AND payment_status <> 'paid'
  `);
  const revenue = Number(revenueRow?.total || 0);
  return {
    totalExpensesToday: Number(expenseRow?.today || 0),
    totalExpensesWeek: Number(expenseRow?.week || 0),
    totalExpensesMonth: Number(expenseRow?.month || 0),
    staffSalaryPaidMonth: Number(expenseRow?.salaryPaid || 0),
    commissionPaidMonth: Number(expenseRow?.commissionPaid || 0),
    productPurchaseMonth: Number(expenseRow?.productPurchase || 0),
    otherExpensesMonth: Number(expenseRow?.otherExpenses || 0),
    pendingSalaryBalance: Number(pendingRow?.total || 0),
    monthlyRevenue: revenue,
    netRevenueAfterExpenses: revenue - Number(expenseRow?.month || 0),
  };
}

function validateCategory(category) {
  const value = cleanText(category, '');
  if (!EXPENSE_CATEGORIES.includes(value)) throw new Error('Valid expense category is required');
  return value;
}

async function saveExpense(db, data, userId) {
  const category = validateCategory(data.category);
  const amount = money(data.amount);
  const payment = normalizePayment(data.paymentMethod || data.payment_method, amount, data.cashAmount || data.cash_amount, data.onlineAmount || data.online_amount);
  const title = cleanText(data.title, '');
  if (!title) throw new Error('Expense title is required');
  const expenseDate = cleanText(data.expenseDate || data.expense_date, today());
  const notes = cleanText(data.notes, '') || title;
  const values = [
    title, category, amount, payment.paymentMethod, payment.cash, payment.online,
    cleanText(data.paidBy || data.paid_by, ''), cleanText(data.paidTo || data.paid_to, ''),
    expenseDate, notes, cleanText(data.referenceNumber || data.reference_number, ''),
    cleanText(data.attachmentUrl || data.attachment_url, ''), userId,
  ];
  if (data.id) {
    await db.run(`
      UPDATE expenses
      SET title = ?, category = ?, amount = ?, payment_method = ?, cash_amount = ?,
          online_amount = ?, paid_by = ?, paid_to = ?, expense_date = ?::date, notes = ?,
          reference_number = ?, attachment_url = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL
    `, [...values, Number(data.id)]);
    return Number(data.id);
  }
  const result = await db.run(`
    INSERT INTO expenses (
      title, category, amount, payment_method, cash_amount, online_amount,
      paid_by, paid_to, expense_date, notes, reference_number, attachment_url,
      created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, ?)
  `, [...values, userId]);
  return result.lastInsertRowid;
}

async function saveSalary(db, data, userId) {
  const staffId = Number(data.staffId || data.staff_id || 0);
  if (!staffId) throw new Error('Select staff member');
  const staff = await db.get(`
    SELECT u.full_name, sp.salon_role, COALESCE(sp.base_salary, 0) as base_salary
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.is_active = TRUE
  `, [staffId]);
  if (!staff) throw new Error('Selected staff was not found');
  const salaryMonth = cleanText(data.salaryMonth || data.salary_month, new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(salaryMonth)) throw new Error('Salary month must be YYYY-MM');
  const metrics = await getStaffMonthMetrics(db, staffId, salaryMonth);
  const baseSalary = money(data.baseSalary ?? data.base_salary ?? staff.base_salary);
  const commissionEarned = money(data.commissionEarned ?? data.commission_earned ?? metrics.commissionEarned);
  const bonus = money(data.bonus);
  const deduction = money(data.deduction);
  const totalPayable = Math.max(0, baseSalary + commissionEarned + bonus - deduction);
  const amountPaid = money(data.amountPaid ?? data.amount_paid);
  if (amountPaid > totalPayable) throw new Error('Amount paid cannot exceed total payable');
  const remainingBalance = Math.max(0, totalPayable - amountPaid);
  const paymentStatus = amountPaid <= 0 ? 'unpaid' : remainingBalance <= 0 ? 'paid' : 'partially_paid';
  if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new Error('Invalid payment status');
  const payment = normalizePayment(data.paymentMethod || data.payment_method, amountPaid, data.cashAmount || data.cash_amount, data.onlineAmount || data.online_amount);
  const paymentDate = cleanText(data.paymentDate || data.payment_date, today());
  const notes = cleanText(data.notes, '');

  return db.transaction(async (tx) => {
    let salaryId = Number(data.id || 0) || null;
    if (salaryId) {
      await tx.run(`
        UPDATE salary_payments
        SET staff_id = ?, salary_month = ?, base_salary = ?, commission_earned = ?,
            services_completed = ?, revenue_generated = ?, bonus = ?, deduction = ?,
            total_payable = ?, amount_paid = ?, remaining_balance = ?, payment_method = ?,
            cash_amount = ?, online_amount = ?, payment_status = ?, payment_date = ?::date,
            notes = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
      `, [
        staffId, salaryMonth, baseSalary, commissionEarned,
        metrics.servicesCompleted || 0, metrics.revenueGenerated || 0, bonus, deduction,
        totalPayable, amountPaid, remainingBalance, payment.paymentMethod,
        payment.cash, payment.online, paymentStatus, paymentDate, notes, userId, salaryId,
      ]);
    } else {
      const result = await tx.run(`
        INSERT INTO salary_payments (
          staff_id, salary_month, base_salary, commission_earned, services_completed,
          revenue_generated, bonus, deduction, total_payable, amount_paid,
          remaining_balance, payment_method, cash_amount, online_amount,
          payment_status, payment_date, notes, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?)
      `, [
        staffId, salaryMonth, baseSalary, commissionEarned,
        metrics.servicesCompleted || 0, metrics.revenueGenerated || 0, bonus, deduction,
        totalPayable, amountPaid, remainingBalance, payment.paymentMethod,
        payment.cash, payment.online, paymentStatus, paymentDate, notes, userId, userId,
      ]);
      salaryId = result.lastInsertRowid;
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
      }, userId);
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
        }, userId);
      }
      await tx.run('UPDATE salary_payments SET expense_id = ?, updated_at = NOW() WHERE id = ?', [commissionExpenseId || salaryExpenseId, salaryId]);
    }
    await logAction(tx, userId, data.id ? 'update' : 'create', 'salary_payment', salaryId, `${staff.full_name} ${salaryMonth}`);
    return salaryId;
  });
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const staffId = Number(searchParams.get('staffId') || 0);
    const salaryMonth = cleanText(searchParams.get('salaryMonth'), new Date().toISOString().slice(0, 7));
    const staffList = await getStaff(db);
    const staff = await Promise.all(staffList.map(async (member) => ({
      ...member,
      monthMetrics: staffId && staffId === member.id
        ? await getStaffMonthMetrics(db, member.id, salaryMonth)
        : undefined,
    })));
    return NextResponse.json({
      summary: await getSummary(db),
      expenses: await getExpenses(db, searchParams),
      salaries: await getSalaries(db, searchParams),
      staff,
      categories: EXPENSE_CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      paymentStatuses: PAYMENT_STATUSES,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load expenses' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (data.type === 'salary') {
      const id = await saveSalary(db, data, user.id);
      return NextResponse.json({ message: 'Salary payment saved', id }, { status: 201 });
    }
    const id = await saveExpense(db, data, user.id);
    await logAction(db, user.id, 'create', 'expense', id, cleanText(data.title, 'Expense'));
    return NextResponse.json({ message: 'Expense saved', id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to save expense' }, { status: error.status || 400 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (data.type === 'salary') {
      const id = await saveSalary(db, data, user.id);
      return NextResponse.json({ message: 'Salary payment updated', id });
    }
    if (!data.id) return NextResponse.json({ error: 'Expense ID is required' }, { status: 400 });
    const id = await saveExpense(db, data, user.id);
    await logAction(db, user.id, 'update', 'expense', id, cleanText(data.title, 'Expense'));
    return NextResponse.json({ message: 'Expense updated', id });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update expense' }, { status: error.status || 400 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || 0);
    const type = cleanText(searchParams.get('type'), 'expense');
    if (!id) return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    if (type === 'salary') {
      const salary = await db.get('SELECT staff_id, salary_month FROM salary_payments WHERE id = ?', [id]);
      await db.run('UPDATE salary_payments SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [user.id, id]);
      if (salary) {
        await db.run(`
          UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW()
          WHERE reference_number IN (?, ?) AND deleted_at IS NULL
        `, [user.id, `SALARY-${salary.salary_month}-${salary.staff_id}`, `COMMISSION-${salary.salary_month}-${salary.staff_id}`]);
      }
    } else {
      await db.run('UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [user.id, id]);
    }
    await logAction(db, user.id, 'delete', type === 'salary' ? 'salary_payment' : 'expense', id, 'Soft deleted');
    return NextResponse.json({ message: 'Record deleted' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete record' }, { status: error.status || 400 });
  }
}
