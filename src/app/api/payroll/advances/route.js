import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { requireOpenSession, assertDrawerCashAvailable } from '@/lib/business-day/service';
import { nepalDateString } from '@/lib/dates/calendar';
import { resolveReportPeriod } from '@/lib/dates/report-periods';
import { advanceEligibility, createAdvance, getOutstandingAdvance } from '@/lib/payroll/salary-advances';
import { getCommissionSummary } from '@/lib/payroll/commission';

const clean = (value) => String(value || '').replace(/[<>]/g, '').trim();
const money = (value) => Math.round(Number(value) * 100) / 100;

async function policy(db) {
  const rows = await db.all(`SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('advance_ceiling_percent','calendar_system')`);
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const raw = String(values.advance_ceiling_percent ?? '').trim();
  const percent = Number(raw);
  const valid = raw !== '' && Number.isFinite(percent) && percent > 0 && percent <= 100;
  const calendarSystem = values.calendar_system === 'BS' ? 'BS' : 'AD';
  // No ceiling set: up to one month's base salary (salary staff) or all unpaid earned
  // commission (commission staff).
  if (!raw) return { configured: true, defaulted: true, percent: 100, rawCeiling: '', calendarSystem };
  return { configured: valid, defaulted: false, percent, rawCeiling: raw, calendarSystem };
}

// Advance cash leaves through an ordinary salary / commission expense row.
async function createExpense(tx, input, userId, scope) {
  const amount = money(input.amount);
  const method = ['online', 'bank_transfer'].includes(input.paymentMethod) ? input.paymentMethod : 'cash';
  const cash = method === 'cash' ? amount : 0;
  const online = method === 'cash' ? 0 : amount;
  await assertDrawerCashAvailable(tx, cash, { label: 'salary advance' });
  const category = input.category === 'Staff Commission' ? 'Staff Commission' : 'Staff Salary';
  const result = await tx.run(`INSERT INTO expenses (title, category, amount, payment_method, cash_amount, online_amount, paid_by, paid_to, expense_date, notes, reference_number, record_type, created_by, updated_by, business_day_id, store_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, 'EXPENSE', ?, ?, ?, ?)`, [input.title, category, amount, method, cash, online, input.paidBy, input.paidTo, input.expenseDate, input.notes, input.referenceNumber, userId, userId, scope.businessDayId, scope.storeSessionId]);
  return result.lastInsertRowid;
}

const STAFF_SQL = `SELECT u.id, u.full_name AS name, sp.salon_role AS role, COALESCE(sp.base_salary,0) AS base_salary, COALESCE(sp.pay_type,'salary') AS pay_type, COALESCE(sp.commission_percentage,0) AS commission_percentage FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.is_active=TRUE AND sp.salon_role IN ('barber','stylist','beautician')`;

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.PAYROLL_VIEW);
    const advancePolicy = await policy(db);
    const period = resolveReportPeriod('this_month', { calendarSystem: advancePolicy.calendarSystem });
    const q = new URL(request.url).searchParams;
    const isAdmin = user.role === 'admin';

    // One commission-based staff member's earnings (today … custom range) and allowance.
    const staffId = Number(q.get('staffId') || 0);
    if (staffId) {
      const staff = await db.get(`${STAFF_SQL} AND u.id = ?`, [staffId]);
      if (!staff) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
      if (staff.pay_type !== 'commission') return NextResponse.json({ error: 'This staff member is salary-based' }, { status: 400 });
      const summary = await getCommissionSummary(db, staffId, {
        ceilingPercent: advancePolicy.percent,
        calendarSystem: advancePolicy.calendarSystem,
        period: clean(q.get('period')) || null,
        startDate: clean(q.get('startDate')) || null,
        endDate: clean(q.get('endDate')) || null,
      });
      return NextResponse.json({ staffId, name: staff.name, commissionPercentage: Number(staff.commission_percentage), summary });
    }

    const staff = await db.all(`${STAFF_SQL} ORDER BY u.full_name`);
    const employees = await Promise.all(staff.map(async (row) => {
      const eligibility = advancePolicy.configured
        ? await advanceEligibility(db, { id: row.id, pay_type: row.pay_type, base_salary: row.base_salary }, { ceilingPercent: advancePolicy.rawCeiling, calendarSystem: advancePolicy.calendarSystem, period })
        : { basis: row.pay_type, remaining: 0 };
      const issued = await db.get(`SELECT COALESCE(SUM(amount),0) AS total FROM salary_advances WHERE staff_id=? AND deleted_at IS NULL AND status <> 'CANCELLED' AND payment_date >= ?::date AND payment_date <= ?::date`, [row.id, period.start, period.end]);
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        payType: row.pay_type,
        outstandingAdvance: await getOutstandingAdvance(db, row.id),
        periodIssued: money(issued.total || 0),
        remainingEligible: money(eligibility.remaining || 0),
        noBaseSalary: Boolean(eligibility.noBaseSalary),
        ...(eligibility.basis === 'commission' ? { unpaidCommission: money(eligibility.owed || 0) } : {}),
        ...(isAdmin ? { baseSalary: Number(row.base_salary), periodMaximum: eligibility.maximum ?? null } : {}),
      };
    }));
    return NextResponse.json({ policy: { configured: advancePolicy.configured, ceilingPercent: isAdmin ? advancePolicy.percent : undefined, period }, canOverride: isAdmin, employees });
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
    const period = resolveReportPeriod('this_month', { calendarSystem: advancePolicy.calendarSystem });
    const paymentDate = clean(data.paymentDate) || nepalDateString();
    const result = await db.transaction(async (tx) => createAdvance(tx, {
      ...data,
      staffId: Number(data.staffId || 0),
      amount,
      paymentDate,
      payrollPeriodStart: period.start,
      payrollPeriodEnd: period.end,
      ceilingPercent: advancePolicy.rawCeiling,
      // Only an admin may go over the allowance, and only with a written reason.
      allowOverride: user.role === 'admin',
      overrideReason: data.overrideReason,
      idempotencyKey,
      sourceIdentifier: `ADV-${idempotencyKey}`,
    }, user.id, { businessDayId: scope.businessDayId, storeSessionId: scope.sessionId }, (innerTx, input, actor, innerScope) => createExpense(innerTx, { ...input, paidBy: user.full_name || user.username }, actor, innerScope)));
    return NextResponse.json({ message: result.basis === 'commission' ? 'Commission advance issued' : 'Salary advance issued', ...result }, { status: 201 });
  } catch (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This advance request has already been processed' }, { status: 409 });
    return NextResponse.json({ error: error.message || 'Unable to issue salary advance', code: error.code, available: error.available }, { status: error.status || 500 });
  }
}
