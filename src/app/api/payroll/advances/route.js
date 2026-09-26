import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { requireOpenSession, assertDrawerCashAvailable } from '@/lib/business-day/service';
import { nepalDateString } from '@/lib/dates/calendar';
import { resolveReportPeriod } from '@/lib/dates/report-periods';
import { createAdvance, getOutstandingAdvance } from '@/lib/payroll/salary-advances';

const clean = (value) => String(value || '').replace(/[<>]/g, '').trim();
const money = (value) => Math.round(Number(value) * 100) / 100;

async function policy(db) {
  const rows = await db.all(`SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('advance_ceiling_percent','calendar_system')`);
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const raw = String(values.advance_ceiling_percent ?? '').trim();
  const percent = Number(raw);
  const valid = raw !== '' && Number.isFinite(percent) && percent > 0 && percent <= 100;
  // No ceiling set: a staff member may receive up to one month's base salary per payroll period.
  if (!raw) return { configured: true, defaulted: true, percent: 100, calendarSystem: values.calendar_system === 'BS' ? 'BS' : 'AD' };
  return { configured: valid, defaulted: false, percent, calendarSystem: values.calendar_system === 'BS' ? 'BS' : 'AD' };
}

async function createExpense(tx, input, userId, scope) {
  const amount = money(input.amount);
  const method = ['online', 'bank_transfer'].includes(input.paymentMethod) ? input.paymentMethod : 'cash';
  const cash = method === 'cash' ? amount : 0;
  const online = method === 'cash' ? 0 : amount;
  await assertDrawerCashAvailable(tx, cash, { label: 'salary advance' });
  const result = await tx.run(`INSERT INTO expenses (title, category, amount, payment_method, cash_amount, online_amount, paid_by, paid_to, expense_date, notes, reference_number, record_type, created_by, updated_by, business_day_id, store_session_id) VALUES (?, 'Staff Salary', ?, ?, ?, ?, ?, ?, ?::date, ?, ?, 'EXPENSE', ?, ?, ?, ?)`, [input.title, amount, method, cash, online, input.paidBy, input.paidTo, input.expenseDate, input.notes, input.referenceNumber, userId, userId, scope.businessDayId, scope.storeSessionId]);
  return result.lastInsertRowid;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.PAYROLL_VIEW);
    const advancePolicy = await policy(db);
    const period = resolveReportPeriod('this_month', { calendarSystem: advancePolicy.calendarSystem });
    const staff = await db.all(`SELECT u.id, u.full_name AS name, sp.salon_role AS role, COALESCE(sp.base_salary,0) AS base_salary FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.is_active=TRUE AND sp.salon_role IN ('barber','stylist','beautician') ORDER BY u.full_name`);
    const employees = await Promise.all(staff.map(async (row) => {
      const issued = await db.get(`SELECT COALESCE(SUM(amount),0) AS total FROM salary_advances WHERE staff_id=? AND deleted_at IS NULL AND status <> 'CANCELLED' AND payment_date >= ?::date AND payment_date <= ?::date`, [row.id, period.start, period.end]);
      const max = advancePolicy.configured ? money(Number(row.base_salary) * advancePolicy.percent / 100) : 0;
      return { id: row.id, name: row.name, role: row.role, outstandingAdvance: await getOutstandingAdvance(db, row.id), periodIssued: money(issued.total || 0), remainingEligible: Math.max(0, money(max - Number(issued.total || 0))), ...(user.role === 'admin' ? { baseSalary: Number(row.base_salary), periodMaximum: max } : {}) };
    }));
    return NextResponse.json({ policy: { configured: advancePolicy.configured, ceilingPercent: user.role === 'admin' ? advancePolicy.percent : undefined, period }, employees });
  } catch (error) { return NextResponse.json({ error: error.message || 'Unable to load advances' }, { status: error.status || 500 }); }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.ADVANCES_CREATE);
    const data = await request.json();
    const amount = money(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Advance amount must be greater than zero' }, { status: 400 });
    const advancePolicy = await policy(db);
    if (!advancePolicy.configured) return NextResponse.json({ error: 'Admin must configure the salary advance ceiling before advances can be issued' }, { status: 409 });
    const idempotencyKey = clean(request.headers.get('idempotency-key') || data.idempotency_key) || randomUUID();
    const existing = await db.get('SELECT id, amount FROM salary_advances WHERE idempotency_key=?', [idempotencyKey]);
    if (existing) return NextResponse.json({ advanceId: existing.id, amount: Number(existing.amount), duplicate: true });
    const scope = await requireOpenSession(db);
    const result = await db.transaction(async (tx) => {
      const staffId = Number(data.staffId || 0);
      const staff = await tx.get(`SELECT u.id, u.full_name, COALESCE(sp.base_salary,0) AS base_salary FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.id=? AND u.is_active=TRUE AND sp.salon_role IN ('barber','stylist','beautician') FOR UPDATE`, [staffId]);
      if (!staff) { const error = new Error('Selected employee is not eligible'); error.status = 400; throw error; }
      const period = resolveReportPeriod('this_month', { calendarSystem: advancePolicy.calendarSystem });
      const issued = await tx.get(`SELECT COALESCE(SUM(amount),0) AS total FROM salary_advances WHERE staff_id=? AND deleted_at IS NULL AND status <> 'CANCELLED' AND payment_date >= ?::date AND payment_date <= ?::date`, [staffId, period.start, period.end]);
      const maximum = money(Number(staff.base_salary) * advancePolicy.percent / 100);
      if (maximum <= 0) { const error = new Error(`${staff.full_name} has no base salary set, so no advance can be issued. Ask an admin to set it in Staff.`); error.status = 422; throw error; }
      if (money(Number(issued.total || 0) + amount) > maximum) { const error = new Error(`Advance exceeds the employee's remaining period allowance (Rs ${Math.max(0, money(maximum - Number(issued.total || 0))).toFixed(2)} left)`); error.status = 422; throw error; }
      const paymentDate = clean(data.paymentDate) || nepalDateString();
      return createAdvance(tx, { ...data, amount, paymentDate, payrollPeriodStart: period.start, payrollPeriodEnd: period.end, eligibleSalary: Number(staff.base_salary), ceilingPercent: advancePolicy.percent, idempotencyKey, sourceIdentifier: `ADV-${idempotencyKey}` }, user.id, { businessDayId: scope.businessDayId, storeSessionId: scope.sessionId }, (innerTx, input, actor, innerScope) => createExpense(innerTx, { ...input, paidBy: user.full_name || user.username }, actor, innerScope));
    });
    return NextResponse.json({ message: 'Salary advance issued', ...result }, { status: 201 });
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This advance request has already been processed' }, { status: 409 });
    return NextResponse.json({ error: error.message || 'Unable to issue salary advance' }, { status: error.status || 500 });
  }
}
