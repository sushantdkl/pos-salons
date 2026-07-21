import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CASHIER_CATEGORIES = [
  'TEA_SNACKS',
  'WATER_JAR',
  'CLEANING',
  'TRANSPORT',
  'MAINTENANCE',
  'PETTY_PURCHASE',
  'OTHER_EXPENSE',
  'DAILY_SAVING',
];

const PAYMENT_METHODS = ['CASH', 'ONLINE', 'BANK'];

function salonDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function money(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Amount must be greater than zero');
  return Math.round(parsed * 100) / 100;
}

function paymentToDb(method) {
  if (method === 'ONLINE') return 'online';
  if (method === 'BANK') return 'bank_transfer';
  return 'cash';
}

function mapExpense(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    recordType: row.record_type || 'EXPENSE',
    expenseDate: row.expense_date,
    notes: row.notes || '',
    referenceNumber: row.reference_number || '',
    createdAt: row.created_at,
  };
}

async function getCashierExpenses(db, userId, searchParams) {
  const clauses = ['deleted_at IS NULL', 'created_by = ?'];
  const params = [userId];
  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(title ILIKE ? OR category ILIKE ? OR notes ILIKE ? OR reference_number ILIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  const category = cleanText(searchParams.get('category'), '');
  if (category && category !== 'all') {
    clauses.push('category = ?');
    params.push(category);
  }
  const rows = await db.all(`
    SELECT *
    FROM expenses
    WHERE ${clauses.join(' AND ')}
    ORDER BY expense_date DESC, id DESC
    LIMIT 100
  `, params);
  return rows.map(mapExpense);
}

async function getCashierSummary(db, userId) {
  const today = salonDateString();
  const row = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN record_type = 'EXPENSE' THEN amount ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN record_type = 'CASH_TRANSFER' THEN amount ELSE 0 END), 0) as savings,
      COUNT(*)::int as records
    FROM expenses
    WHERE deleted_at IS NULL
      AND created_by = ?
      AND expense_date = ?::date
  `, [userId, today]);
  return {
    todayExpenses: Number(row?.expenses || 0),
    todaySavings: Number(row?.savings || 0),
    todayRecords: Number(row?.records || 0),
  };
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['cashier', 'admin']);
    const { searchParams } = new URL(request.url);
    const userId = user.role === 'admin' && searchParams.get('createdBy')
      ? Number(searchParams.get('createdBy'))
      : user.id;
    return NextResponse.json({
      categories: CASHIER_CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      summary: await getCashierSummary(db, userId),
      expenses: await getCashierExpenses(db, userId, searchParams),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to load daily expenses' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['cashier', 'admin']);
    const data = await request.json();
    const title = cleanText(data.title, '');
    const category = cleanText(data.category, '');
    const paymentMethod = cleanText(data.paymentMethod || data.payment_method, 'CASH').toUpperCase();
    const expenseDate = cleanText(data.expenseDate || data.expense_date, salonDateString());
    const today = salonDateString();

    if (!title) throw new Error('Expense title is required');
    if (!CASHIER_CATEGORIES.includes(category)) throw new Error('Select a valid daily expense category');
    if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error('Select a valid payment method');
    if (user.role !== 'admin' && expenseDate !== today) {
      const error = new Error('Cashier can only add same-day daily expenses');
      error.status = 403;
      throw error;
    }

    const amount = money(data.amount);
    const recordType = category === 'DAILY_SAVING' ? 'CASH_TRANSFER' : 'EXPENSE';
    const dbPayment = paymentToDb(paymentMethod);
    const cashAmount = dbPayment === 'cash' ? amount : 0;
    const onlineAmount = dbPayment === 'cash' ? 0 : amount;

    const result = await db.run(`
      INSERT INTO expenses (
        title, category, amount, payment_method, cash_amount, online_amount,
        paid_by, paid_to, expense_date, notes, reference_number, attachment_url,
        record_type, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      category,
      amount,
      dbPayment,
      cashAmount,
      onlineAmount,
      cleanText(data.paidBy || data.paid_by, 'Cashier'),
      cleanText(data.paidTo || data.paid_to, ''),
      expenseDate,
      cleanText(data.notes, ''),
      cleanText(data.referenceNumber || data.reference_number, ''),
      '',
      recordType,
      user.id,
      user.id,
    ]);

    await logAction(db, user.id, 'create', recordType === 'CASH_TRANSFER' ? 'cash_transfer' : 'daily_expense', result.lastInsertRowid, title);
    return NextResponse.json({ message: recordType === 'CASH_TRANSFER' ? 'Daily saving recorded' : 'Daily expense recorded', id: result.lastInsertRowid }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to save daily expense' }, { status: error.status || 400 });
  }
}
