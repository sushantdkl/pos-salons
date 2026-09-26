import { nepalDateString } from '../dates/calendar.js';
import { resolveReportPeriod } from '../dates/report-periods.js';

/**
 * ADVANCE SALARY.
 *
 * Accounting model — deliberately the SAME cash-basis model the payroll already uses:
 * a salary expense row exists only when money actually moves. An advance is a salary
 * payment made early, so it writes ONE `expenses` row (category 'Staff Salary') at the
 * moment it is paid. The later monthly settlement APPLIES the advance as a deduction, so
 * only the remaining amount is paid and expensed again.
 *
 *   advance paid          Rs  8,000  -> expense Rs  8,000
 *   settlement Rs 30,000  -> applied Rs 8,000, paid Rs 22,000 -> expense Rs 22,000
 *   total salary expense  Rs 30,000                  <- recognised exactly once
 *
 * Because the cash movement is an ordinary expense row, cash/online split, Expected Cash in
 * Drawer, Business Day scoping and every existing report stay correct with no new money maths
 * anywhere. Nothing in this module recomputes a balance that finance-summary already owns.
 */

export const ADVANCE_STATUS = {
  OUTSTANDING: 'OUTSTANDING',
  PARTIALLY_APPLIED: 'PARTIALLY_APPLIED',
  APPLIED: 'APPLIED',
  CANCELLED: 'CANCELLED',
};

function money(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function statusFor(amount, applied) {
  if (applied <= 0.001) return ADVANCE_STATUS.OUTSTANDING;
  if (applied >= amount - 0.001) return ADVANCE_STATUS.APPLIED;
  return ADVANCE_STATUS.PARTIALLY_APPLIED;
}

/** Live advances for a staff member, oldest first (advances are applied FIFO). */
export async function getStaffAdvances(db, staffId) {
  const rows = await db.all(`
    SELECT a.id, a.amount, a.applied_amount, a.payment_method, a.cash_amount, a.online_amount,
           a.payment_date, a.reference_number, a.note, a.status, a.created_at,
           COALESCE(u.full_name, u.username, '') AS created_by_name
    FROM salary_advances a
    LEFT JOIN users u ON u.id = a.created_by
    WHERE a.staff_id = ? AND a.deleted_at IS NULL AND a.status <> 'CANCELLED'
    ORDER BY a.payment_date ASC, a.id ASC
  `, [staffId]);

  return rows.map((row) => ({
    id: row.id,
    amount: money(row.amount),
    appliedAmount: money(row.applied_amount),
    outstanding: money(money(row.amount) - money(row.applied_amount)),
    paymentMethod: row.payment_method,
    cashAmount: money(row.cash_amount),
    onlineAmount: money(row.online_amount),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number || '',
    note: row.note || '',
    status: row.status,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
  }));
}

/** Total still to be recovered from future salary for one staff member. */
export async function getOutstandingAdvance(db, staffId) {
  const row = await db.get(`
    SELECT COALESCE(SUM(amount - applied_amount), 0) AS outstanding
    FROM salary_advances
    WHERE staff_id = ? AND deleted_at IS NULL AND status <> 'CANCELLED'
  `, [staffId]);
  return money(row?.outstanding);
}

/** Outstanding advance for every staff member, for list screens. */
export async function getOutstandingAdvanceByStaff(db) {
  const rows = await db.all(`
    SELECT staff_id, COALESCE(SUM(amount - applied_amount), 0) AS outstanding,
           COALESCE(SUM(amount), 0) AS total_given, COUNT(*)::int AS records
    FROM salary_advances
    WHERE deleted_at IS NULL AND status <> 'CANCELLED'
    GROUP BY staff_id
  `);
  return rows.reduce((acc, row) => {
    acc[String(row.staff_id)] = {
      outstanding: money(row.outstanding),
      totalGiven: money(row.total_given),
      records: Number(row.records || 0),
    };
    return acc;
  }, {});
}

/**
 * What a settlement would look like right now: the gross payable, how much outstanding
 * advance it can absorb, and what is genuinely still owed in cash.
 *
 * An advance larger than the payable is NEVER turned into a negative salary — only the
 * payable amount is absorbed and the rest stays outstanding for the next period.
 */
export function planSettlement(grossPayable, outstandingAdvance) {
  const gross = Math.max(0, money(grossPayable));
  const outstanding = Math.max(0, money(outstandingAdvance));
  const advanceApplied = money(Math.min(outstanding, gross));
  return {
    grossPayable: gross,
    outstandingAdvance: outstanding,
    advanceApplied,
    remainingPayable: money(gross - advanceApplied),
    advanceCarriedForward: money(outstanding - advanceApplied),
  };
}

/**
 * Record an advance. The caller supplies `createExpense`, which is the payroll module's own
 * expense writer — so the cash/online movement is booked exactly like every other salary
 * payment and no second code path can drift from it.
 */
export async function createAdvance(tx, input, userId, scope = {}, createExpense) {
  const staffId = Number(input.staffId || input.staff_id || 0);
  if (!staffId) throw badRequest('Select a staff member');

  const staff = await tx.get(
    `SELECT u.id, u.full_name, COALESCE(sp.base_salary,0) AS base_salary FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.id = ? AND u.is_active = TRUE AND sp.salon_role IN ('barber','stylist','beautician') FOR UPDATE`,
    [staffId]
  );
  if (!staff) throw badRequest('Selected staff was not found');

  const amount = money(input.amount);
  if (amount <= 0) throw badRequest('Advance amount must be greater than zero');

  const settingRows = await tx.all(`SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('advance_ceiling_percent','calendar_system')`);
  const settings = Object.fromEntries(settingRows.map((row) => [row.setting_key, row.setting_value]));
  // No limit set means up to one month's base salary per payroll period (same rule as the
  // cashier's advance screen), so advances are never locked just because the field is blank.
  const rawCeiling = input.ceilingPercent ?? settings.advance_ceiling_percent;
  const ceilingPercent = rawCeiling === undefined || rawCeiling === null || String(rawCeiling).trim() === '' ? 100 : Number(rawCeiling);
  if (!Number.isFinite(ceilingPercent) || ceilingPercent <= 0 || ceilingPercent > 100) {
    const error = new Error('Admin must configure the salary advance ceiling before advances can be issued'); error.status = 409; throw error;
  }
  const period = input.payrollPeriodStart && input.payrollPeriodEnd
    ? { start: input.payrollPeriodStart, end: input.payrollPeriodEnd }
    : resolveReportPeriod('this_month', { calendarSystem: settings.calendar_system });
  const alreadyIssued = await tx.get(`SELECT COALESCE(SUM(amount),0) AS total FROM salary_advances WHERE staff_id=? AND deleted_at IS NULL AND status <> 'CANCELLED' AND payment_date >= ?::date AND payment_date <= ?::date`, [staffId, period.start, period.end]);
  const maximum = money(Number(staff.base_salary) * ceilingPercent / 100);
  if (money(Number(alreadyIssued?.total || 0) + amount) > maximum) {
    const error = new Error("Advance exceeds the employee's remaining period allowance"); error.status = 422; throw error;
  }

  const paymentDate = String(input.paymentDate || input.payment_date || nepalDateString()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw badRequest('A valid payment date is required');

  const referenceNumber = String(input.referenceNumber || input.reference_number || '').replace(/[<>]/g, '').trim();
  const note = String(input.note || input.notes || '').replace(/[<>]/g, '').trim();

  // The advance IS a salary payment in cash terms, so it books an ordinary salary expense.
  // That single row is what moves cash / online balances and Expected Cash in Drawer.
  const expenseId = await createExpense(tx, {
    title: `Advance salary - ${staff.full_name}`,
    category: 'Staff Salary',
    amount,
    paymentMethod: input.paymentMethod || input.payment_method,
    cashAmount: input.cashAmount ?? input.cash_amount,
    onlineAmount: input.onlineAmount ?? input.online_amount,
    paidBy: 'Admin',
    paidTo: staff.full_name,
    expenseDate: paymentDate,
    notes: note || `Advance salary paid to ${staff.full_name}`,
    referenceNumber: referenceNumber || `ADVANCE-${staffId}-${Date.now()}`,
  }, userId, scope);

  // Mirror the split the expense actually recorded so the two can never disagree.
  const booked = await tx.get(
    `SELECT payment_method, cash_amount, online_amount FROM expenses WHERE id = ?`,
    [expenseId]
  );

  const result = await tx.run(`
    INSERT INTO salary_advances (
      staff_id, amount, applied_amount, payment_method, cash_amount, online_amount,
      payment_date, reference_number, note, status, expense_id,
      business_day_id, store_session_id, created_by, updated_by,
      payroll_period_start, payroll_period_end, eligible_salary_snapshot,
      ceiling_percent_snapshot, idempotency_key, source_identifier
    ) VALUES (?, ?, 0, ?, ?, ?, ?::date, ?, ?, 'OUTSTANDING', ?, ?, ?, ?, ?, ?::date, ?::date, ?, ?, ?, ?)
  `, [
    staffId, amount, booked?.payment_method || 'cash',
    money(booked?.cash_amount), money(booked?.online_amount),
    paymentDate, referenceNumber || null, note || null, expenseId,
    scope.businessDayId ?? null, scope.storeSessionId ?? null, userId, userId,
    period.start, period.end, input.eligibleSalary ?? Number(staff.base_salary),
    ceilingPercent, input.idempotencyKey || null, input.sourceIdentifier || null,
  ]);

  const advanceId = result.lastInsertRowid;
  await tx.run('UPDATE expenses SET advance_id = ? WHERE id = ?', [advanceId, expenseId]);
  return { advanceId, expenseId, amount, staffName: staff.full_name };
}

/**
 * Undo the advance applications of one salary settlement.
 *
 * Editing a settlement must not consume advances twice, so its previous applications are
 * released before the new ones are recorded. Advance history itself is never deleted — only
 * the link rows for THIS settlement are removed.
 */
export async function releaseApplications(tx, salaryPaymentId) {
  const rows = await tx.all(
    `SELECT advance_id, amount_applied FROM salary_advance_applications WHERE salary_payment_id = ?`,
    [salaryPaymentId]
  );
  for (const row of rows) {
    const advance = await tx.get(`SELECT amount, applied_amount FROM salary_advances WHERE id = ?`, [row.advance_id]);
    if (!advance) continue;
    const applied = Math.max(0, money(advance.applied_amount) - money(row.amount_applied));
    await tx.run(
      `UPDATE salary_advances SET applied_amount = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [applied, statusFor(money(advance.amount), applied), row.advance_id]
    );
  }
  await tx.run(`DELETE FROM salary_advance_applications WHERE salary_payment_id = ?`, [salaryPaymentId]);
}

/**
 * Consume `amountToApply` of outstanding advance, oldest advance first, recording which
 * advance funded which settlement. Returns the total actually applied.
 */
export async function applyAdvances(tx, { staffId, salaryPaymentId, amountToApply, userId }) {
  let remaining = money(amountToApply);
  if (remaining <= 0) return 0;

  const advances = await tx.all(`
    SELECT id, amount, applied_amount
    FROM salary_advances
    WHERE staff_id = ? AND deleted_at IS NULL AND status <> 'CANCELLED'
      AND amount - applied_amount > 0
    ORDER BY payment_date ASC, id ASC
  `, [staffId]);

  let applied = 0;
  for (const advance of advances) {
    if (remaining <= 0.001) break;
    const available = money(money(advance.amount) - money(advance.applied_amount));
    if (available <= 0) continue;
    const take = money(Math.min(available, remaining));
    const newApplied = money(money(advance.applied_amount) + take);

    await tx.run(
      `UPDATE salary_advances SET applied_amount = ?, status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [newApplied, statusFor(money(advance.amount), newApplied), userId, advance.id]
    );
    await tx.run(
      `INSERT INTO salary_advance_applications (advance_id, salary_payment_id, amount_applied, created_by)
       VALUES (?, ?, ?, ?)`,
      [advance.id, salaryPaymentId, take, userId]
    );

    applied = money(applied + take);
    remaining = money(remaining - take);
  }
  return applied;
}

/**
 * Cancel an advance and reverse the money it moved.
 *
 * An advance that has already been settled into a salary payment cannot be cancelled here:
 * doing so would leave the settlement claiming a deduction that no longer exists. The admin
 * must edit that salary payment first, which releases the application and returns the advance
 * to OUTSTANDING.
 *
 * Cancelling soft-deletes the linked expense row, so the cash or online outflow — and with it
 * Expected Cash in Drawer — is reversed through the same shared logic that recorded it.
 */
export async function cancelAdvance(tx, { advanceId, reason, userId }) {
  const advance = await tx.get(
    `SELECT id, staff_id, amount, applied_amount, status, expense_id FROM salary_advances WHERE id = ? AND deleted_at IS NULL`,
    [advanceId]
  );
  if (!advance) throw badRequest('Advance not found');
  if (advance.status === ADVANCE_STATUS.CANCELLED) throw badRequest('This advance is already cancelled');
  if (money(advance.applied_amount) > 0) {
    throw badRequest(
      `Rs ${money(advance.applied_amount).toFixed(2)} of this advance has already been deducted from a salary payment. `
      + 'Edit that salary payment first to release the deduction, then cancel the advance.'
    );
  }

  const note = String(reason || '').replace(/[<>]/g, '').trim();
  if (!note) throw badRequest('A reason is required to cancel an advance');

  // Reverse the payment by removing its expense row; every balance reads from that table.
  if (advance.expense_id) {
    await tx.run(
      `UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [userId, advance.expense_id]
    );
  }

  await tx.run(`
    UPDATE salary_advances
    SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?,
        updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `, [userId, note, userId, advanceId]);

  return { advanceId, amount: money(advance.amount), staffId: advance.staff_id };
}

/** Advance rows applied to a given settlement, for the salary detail view. */
export async function getApplicationsForSalary(db, salaryPaymentId) {
  const rows = await db.all(`
    SELECT ap.amount_applied, a.id AS advance_id, a.payment_date, a.payment_method, a.note
    FROM salary_advance_applications ap
    JOIN salary_advances a ON a.id = ap.advance_id
    WHERE ap.salary_payment_id = ?
    ORDER BY a.payment_date ASC, a.id ASC
  `, [salaryPaymentId]);
  return rows.map((row) => ({
    advanceId: row.advance_id,
    amountApplied: money(row.amount_applied),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    note: row.note || '',
  }));
}

/**
 * Period totals for payroll reporting.
 *
 * `advancesGiven` is a CASH-FLOW figure (money handed over as advances in the period).
 * `regularSalaryPaid` is the rest of the salary cash outflow. Their sum is the payroll cash
 * outflow, which already equals the salary expense total — an advance is not an extra
 * expense on top of the settlement, it is part of it.
 */
export async function getAdvanceTotals(db, { startDate = null, endDate = null } = {}) {
  const useRange = Boolean(startDate && endDate);
  const given = await db.get(`
    SELECT COALESCE(SUM(amount), 0) AS total,
           COALESCE(SUM(cash_amount), 0) AS cash,
           COALESCE(SUM(online_amount), 0) AS online,
           COUNT(*)::int AS records
    FROM salary_advances
    WHERE deleted_at IS NULL AND status <> 'CANCELLED'
      ${useRange ? 'AND payment_date >= ?::date AND payment_date <= ?::date' : ''}
  `, useRange ? [startDate, endDate] : []);

  const appliedRow = await db.get(`
    SELECT COALESCE(SUM(ap.amount_applied), 0) AS total
    FROM salary_advance_applications ap
    JOIN salary_payments s ON s.id = ap.salary_payment_id
    WHERE s.deleted_at IS NULL
      ${useRange ? 'AND s.payment_date >= ?::date AND s.payment_date <= ?::date' : ''}
  `, useRange ? [startDate, endDate] : []);

  const outstandingRow = await db.get(`
    SELECT COALESCE(SUM(amount - applied_amount), 0) AS total
    FROM salary_advances WHERE deleted_at IS NULL AND status <> 'CANCELLED'
  `);

  return {
    advancesGiven: money(given?.total),
    advancesGivenCash: money(given?.cash),
    advancesGivenOnline: money(given?.online),
    advanceRecords: Number(given?.records || 0),
    advanceApplied: money(appliedRow?.total),
    outstandingAdvance: money(outstandingRow?.total),
  };
}
