/**
 * COMMISSION-BASED STAFF — what they have earned, and how much of it can be advanced.
 *
 * Commission is written on every paid service line (salon_bill_items.commission_amount) at the
 * moment of sale. A voided bill becomes status 'cancelled' and drops out of every figure here.
 *
 * Advance rule (recoverable draw against EARNED commission):
 *
 *   owed        = commission earned since the last settled payroll month
 *                 + balance still unpaid on earlier settlements
 *   can advance = owed x ceiling% - advances not yet recovered
 *
 * Only commission already earned can be advanced, so a staff member never ends up owing the
 * salon. The advance is recovered automatically at the next monthly settlement (oldest advance
 * first — see salary-advances.js); anything larger than that month's pay carries forward.
 */

import { BILL_DATE_EXPR_B, periodDateFilter } from '../db/postgres-dates.js';
import { adToBsParts, bsDaysInMonth, bsToAdIso, nepalDateString } from '../dates/calendar.js';
import { getServerCalendarSystem } from '../dates/calendar-setting.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// Salary months are 'YYYY-MM' in the calendar they were chosen in: BS years (2070+) are
// ~57 years ahead of AD, so the two can never be confused.
export const isBsMonth = (month) => Number(String(month).slice(0, 4)) >= 2070;

export function monthStart(month) {
  if (isBsMonth(month)) return bsToAdIso(`${month}-01`);
  return `${month}-01`;
}

export function nextMonthStart(month) {
  const [year, value] = String(month).split('-').map(Number);
  if (isBsMonth(month)) {
    const last = bsToAdIso(`${month}-${String(bsDaysInMonth(year, value)).padStart(2, '0')}`);
    const next = new Date(`${last}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10);
}

/** This month as 'YYYY-MM' in the salon's calendar. */
export function currentSalaryMonth(calendarSystem = getServerCalendarSystem()) {
  const today = nepalDateString();
  if (calendarSystem === 'BS') {
    const bs = adToBsParts(today);
    return `${bs.year}-${String(bs.month).padStart(2, '0')}`;
  }
  return today.slice(0, 7);
}

const NEPAL_DAY = `((${BILL_DATE_EXPR_B}) AT TIME ZONE 'Asia/Kathmandu')::date`;
const EARNED_FROM = `
  FROM salon_bill_items i
  JOIN salon_bills b ON b.id = i.bill_id
  WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
`;

async function earnedIn(db, staffId, period, startDate, endDate) {
  const filter = periodDateFilter(period, startDate, endDate, BILL_DATE_EXPR_B);
  const row = await db.get(`
    SELECT COALESCE(SUM(i.commission_amount), 0) AS commission, COALESCE(SUM(i.subtotal), 0) AS revenue, COUNT(i.id)::int AS services
    ${EARNED_FROM} AND ${filter.clause}
  `, [staffId, ...filter.params]);
  return { commission: round2(row?.commission), revenue: round2(row?.revenue), services: Number(row?.services || 0) };
}

/** Commission earned on or after an AD date (inclusive). */
async function earnedSince(db, staffId, fromDate) {
  const row = await db.get(`
    SELECT COALESCE(SUM(i.commission_amount), 0) AS commission, COUNT(i.id)::int AS services
    ${EARNED_FROM} AND ${NEPAL_DAY} >= ?::date
  `, [staffId, fromDate]);
  return { commission: round2(row?.commission), services: Number(row?.services || 0) };
}

async function earnedAllTime(db, staffId) {
  const row = await db.get(`SELECT COALESCE(SUM(i.commission_amount), 0) AS commission, COUNT(i.id)::int AS services ${EARNED_FROM}`, [staffId]);
  return { commission: round2(row?.commission), services: Number(row?.services || 0) };
}

async function outstandingAdvance(db, staffId) {
  const row = await db.get(`
    SELECT COALESCE(SUM(amount - applied_amount), 0) AS outstanding
    FROM salary_advances WHERE staff_id = ? AND deleted_at IS NULL AND status <> 'CANCELLED'
  `, [staffId]);
  return round2(row?.outstanding);
}

/**
 * The window of commission not yet covered by a settlement: from the first day after the
 * latest settled salary month, or — when nothing was ever settled in the system — from the
 * start of the current payroll month (the conservative choice).
 */
export async function unsettledWindow(db, staffId, calendarSystem = getServerCalendarSystem()) {
  const last = await db.get(`
    SELECT salary_month FROM salary_payments
    WHERE staff_id = ? AND deleted_at IS NULL
    ORDER BY salary_month DESC LIMIT 1
  `, [staffId]);
  if (last?.salary_month) return { from: nextMonthStart(last.salary_month), lastSettledMonth: last.salary_month };
  return { from: monthStart(currentSalaryMonth(calendarSystem)), lastSettledMonth: null };
}

/** What can be advanced right now to a commission-based staff member. */
export async function commissionAdvanceAllowance(db, staffId, { ceilingPercent = 100, calendarSystem } = {}) {
  const window = await unsettledWindow(db, staffId, calendarSystem);
  const unsettled = await earnedSince(db, staffId, window.from);
  const pending = await db.get(`
    SELECT COALESCE(SUM(remaining_balance), 0) AS total FROM salary_payments
    WHERE staff_id = ? AND deleted_at IS NULL AND payment_status <> 'paid'
  `, [staffId]);
  const pendingSettlement = round2(pending?.total);
  const owed = round2(unsettled.commission + pendingSettlement);
  const outstanding = await outstandingAdvance(db, staffId);
  const percent = Number(ceilingPercent) > 0 ? Number(ceilingPercent) : 100;
  return {
    unsettledFrom: window.from,
    lastSettledMonth: window.lastSettledMonth,
    unsettledCommission: unsettled.commission,
    unsettledServices: unsettled.services,
    pendingSettlement,
    owed,
    ceilingPercent: percent,
    outstandingAdvance: outstanding,
    allowance: Math.max(0, round2(owed * percent / 100 - outstanding)),
  };
}

/**
 * Commission snapshot for the advance screen: fixed periods plus an optional custom range,
 * and the advance allowance.
 */
export async function getCommissionSummary(db, staffId, { ceilingPercent, calendarSystem, period, startDate, endDate } = {}) {
  const [today, yesterday, month, lastMonth, allTime, allowance] = await Promise.all([
    earnedIn(db, staffId, 'today'),
    earnedIn(db, staffId, 'yesterday'),
    earnedIn(db, staffId, 'month'),
    earnedIn(db, staffId, 'last_month'),
    earnedAllTime(db, staffId),
    commissionAdvanceAllowance(db, staffId, { ceilingPercent, calendarSystem }),
  ]);
  let selected = null;
  if (period && period !== 'custom') selected = { period, ...(await earnedIn(db, staffId, period)) };
  if (period === 'custom' && startDate && endDate) selected = { period, startDate, endDate, ...(await earnedIn(db, staffId, 'custom', startDate, endDate)) };
  return { today, yesterday, month, lastMonth, allTime, selected, ...allowance };
}
