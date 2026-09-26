/**
 * Business Day + Store Session lifecycle service.
 *
 * Business Day  = the reporting / accounting operational day. Resets current-day metrics.
 * Store Session = one physical Open Store -> Close Store cycle inside a business day.
 * A business day may hold several sessions; their sales accumulate into the same day.
 *
 * Starting / counted cash is PHYSICAL DRAWER MONEY — never revenue, sales, profit or expense.
 * The opening-cash difference is booked as a non-P&L cash movement (expenses.record_type =
 * 'CASH_TRANSFER'), which every P&L and cash-in-hand query already ignores.
 */

import { logAction } from '@/lib/db/helpers';
import { salonDateString } from '@/lib/reports/dashboard-period';
import { getFinancialSummary, numeric, PAID_BILL_STATUS_SQL } from '@/lib/reports/finance-summary';
import { normalizeDenominations } from '@/lib/business-day/denominations';

export const STORE_CLOSED_CODE = 'STORE_CLOSED';

export const CASH_ADJUSTMENT_CATEGORY = 'CASH_ADJUSTMENT';

// Where drawer cash goes when the new starting cash is LOWER than the previous close.
export const REMOVE_DESTINATIONS = ['CASH_RESERVE', 'BANK_DEPOSIT', 'OWNER_WITHDRAWAL', 'OTHER'];
// Where extra drawer cash comes from when starting cash is HIGHER than the previous close.
export const ADD_SOURCES = ['CASH_RESERVE', 'BANK_WITHDRAWAL', 'OWNER_CONTRIBUTION', 'OTHER'];

export const TRANSFER_LABELS = {
  CASH_RESERVE: 'Cash Reserve / Safe',
  BANK_DEPOSIT: 'Bank Deposit',
  OWNER_WITHDRAWAL: 'Owner Withdrawal',
  BANK_WITHDRAWAL: 'Bank Withdrawal',
  OWNER_CONTRIBUTION: 'Owner Contribution',
  OTHER: 'Other',
};

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw badRequest('Cash amount must be zero or more');
  return Math.round(parsed * 100) / 100;
}

function badRequest(message, code) {
  const error = new Error(message);
  error.status = 400;
  if (code) error.code = code;
  return error;
}

/**
 * Normalise a business_date to 'YYYY-MM-DD'. node-postgres returns a DATE column as a JS
 * Date at LOCAL midnight, so its local Y/M/D are the intended calendar date; a plain string
 * is passed through. Using this everywhere avoids UTC drift and "Invalid Date" throws.
 */
function dateIso(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function addDaysIso(value, days) {
  const [year, month, day] = dateIso(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Nepal-local operating date. Never derived from a UTC ISO slice. */
export function currentBusinessDate() {
  return salonDateString();
}

export async function getOpenBusinessDay(db) {
  return db.get(`SELECT * FROM business_days WHERE status = 'OPEN' ORDER BY business_date DESC LIMIT 1`);
}

export async function getOpenSession(db) {
  return db.get(`
    SELECT ss.*, bd.business_date, bd.status AS day_status
    FROM store_sessions ss
    JOIN business_days bd ON bd.id = ss.business_day_id
    WHERE ss.status = 'OPEN'
    ORDER BY ss.id DESC
    LIMIT 1
  `);
}

/**
 * The business day whose metrics the dashboards should show right now: the open day,
 * else the most recent day matching today's Nepal date. Null falls back to calendar today.
 */
export async function getCurrentBusinessDay(db) {
  const open = await getOpenBusinessDay(db);
  if (open) return open;
  return db.get(`SELECT * FROM business_days WHERE business_date = ?::date ORDER BY id DESC LIMIT 1`, [currentBusinessDate()]);
}

async function getLastClosedSession(db, businessDayId) {
  return db.get(`
    SELECT * FROM store_sessions
    WHERE business_day_id = ? AND status = 'CLOSED'
    ORDER BY session_number DESC LIMIT 1
  `, [businessDayId]);
}

async function getLatestClosedDayBefore(db, businessDate) {
  return db.get(`
    SELECT * FROM business_days
    WHERE status = 'CLOSED' AND business_date < ?::date
    ORDER BY business_date DESC LIMIT 1
  `, [businessDate]);
}

/** Cash physically carried out of a day = its last session's counted cash. */
async function dayClosingCash(db, businessDayId) {
  const last = await getLastClosedSession(db, businessDayId);
  return numeric(last?.counted_cash);
}

/**
 * Cash a session is expected to hold — THE drawer formula, used by Close Store, the Opening &
 * Closing screen and every summary that reports a live drawer:
 *
 *   starting_cash + cash sales + credit collected in cash
 *   - cash refunds - cash operating expenses - cash salary/advances - cash savings
 *
 * Every term comes from getFinancialSummary scoped to this session, so it can never disagree
 * with the cash figures shown elsewhere. A bill sold AND voided in this session nets to zero
 * (its cash stays in cash sales, the refund leaves once). Online/QR never touches the drawer.
 * CASH_TRANSFER rows are non-P&L and already reflected in starting_cash.
 */
export async function computeExpectedCash(db, session) {
  const fin = await getFinancialSummary(db, 'today', { storeSessionId: session.id, includeSalary: true });
  const startingCash = numeric(session.starting_cash);
  const cashCollections = numeric(fin.grossCashCollected);
  const creditCollectionsCash = numeric(fin.creditCollectionsCash);
  const cashRefunds = numeric(fin.cashRefunds);
  const operatingExpensesCash = numeric(fin.operatingExpensesCash);
  const salaryCash = numeric(fin.salaryExpensesCash);
  const cashExpenses = operatingExpensesCash + salaryCash;
  const cashSavingsOut = numeric(fin.savingsFromCash);
  const expectedCash = Math.round((startingCash + cashCollections + creditCollectionsCash - cashExpenses - cashRefunds - cashSavingsOut) * 100) / 100;

  return {
    startingCash,
    cashCollections,
    splitCash: numeric(fin.splitCash),
    creditCollectionsCash,
    otherCashIn: 0,
    cashRefunds,
    operatingExpensesCash,
    // Salary + advances paid from the drawer. Callers that serve a cashier must not itemise it.
    salaryCash,
    cashExpenses,
    cashSavingsOut,
    otherCashOut: 0,
    expectedCash,
    // Context figures (NOT part of physical drawer cash):
    qrCollections: numeric(fin.grossQrCollected),
    creditCollectionsOnline: numeric(fin.creditCollectionsOnline),
    onlineRefunds: numeric(fin.onlineRefunds),
    netOnlineBalance: numeric(fin.netOnlineBalance),
  };
}

/**
 * Cash physically available in the drawer right now: the open session's expected cash.
 *
 * Returns null when no session is open — there is no drawer to check against, so callers
 * must treat "unknown" differently from "zero" rather than blocking every payment.
 */
export async function getAvailableDrawerCash(db) {
  const session = await getOpenSession(db);
  if (!session) return null;
  const expected = await computeExpectedCash(db, session);
  return expected.expectedCash;
}

/**
 * Guard a CASH payout against the drawer.
 *
 * Paying out more cash than the drawer holds is a real-world impossibility, and silently
 * allowing it produced a negative Expected Cash in Drawer that nothing warned about. This
 * blocks the payment and names the shortfall. `allowOverdraw` lets an admin record a payment
 * genuinely funded from outside the drawer (owner's pocket, safe) after seeing the warning.
 */
export async function assertDrawerCashAvailable(db, cashAmount, { allowOverdraw = false, label = 'payment' } = {}) {
  const amount = numeric(cashAmount);
  if (amount <= 0 || allowOverdraw) return { checked: false, available: null };
  const available = await getAvailableDrawerCash(db);
  // No open session: the drawer position is unknown, so there is nothing to check against.
  if (available === null) return { checked: false, available: null };
  if (amount > available + 0.01) {
    const error = new Error(
      `This ${label} of Rs ${amount.toFixed(2)} in cash is more than the drawer holds `
      + `(Rs ${Math.max(0, available).toFixed(2)} available). Reduce the cash amount, pay it online, `
      + 'or confirm it is funded from outside the drawer.'
    );
    error.status = 400;
    error.code = 'DRAWER_CASH_SHORT';
    error.available = Math.max(0, available);
    throw error;
  }
  return { checked: true, available };
}
export async function getSessionSummary(db, session) {
  const fin = await getFinancialSummary(db, 'today', { storeSessionId: session.id, includeSalary: true });
  const tokens = await db.get(`
    SELECT
      COUNT(*)::int AS generated,
      COUNT(CASE WHEN status = 'BILLED' AND invoice_id IS NOT NULL THEN 1 END)::int AS converted,
      COUNT(CASE WHEN status IN ('CANCELLED', 'NO_SHOW') THEN 1 END)::int AS cancelled_no_show,
      COUNT(CASE WHEN COALESCE(is_printed, FALSE) = FALSE THEN 1 END)::int AS digital,
      COUNT(CASE WHEN COALESCE(is_printed, FALSE) = TRUE THEN 1 END)::int AS printed
    FROM walk_in_tokens WHERE store_session_id = ?
  `, [session.id]);
  const items = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.quantity ELSE 0 END), 0)::int AS services_sold,
      COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.quantity ELSE 0 END), 0)::int AS products_sold
    FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
    WHERE b.store_session_id = ? AND ${PAID_BILL_STATUS_SQL}
  `, [session.id]);
  const expected = await computeExpectedCash(db, session);

  return {
    sales: {
      grossSales: numeric(fin.grossSalesBeforeDiscount),
      discounts: numeric(fin.totalDiscounts),
      voids: numeric(fin.voidedSales),
      voidCount: Number(fin.voidCount || 0),
      netSales: numeric(fin.netSalesAfterDiscount),
      completedBills: Number(fin.bills || 0),
      avgBill: fin.bills > 0 ? Math.round((numeric(fin.netSalesAfterDiscount) / fin.bills) * 100) / 100 : 0,
      servicesSold: Number(items?.services_sold || 0),
      productsSold: Number(items?.products_sold || 0),
    },
    payments: {
      cash: numeric(fin.grossCashCollected),
      esewaPhonePay: numeric(fin.esewaPhonePayCollected),
      bankQr: numeric(fin.bankQrCollected),
      splitCash: numeric(fin.splitCash),
      splitQr: numeric(fin.splitQr),
      totalCollected: numeric(fin.grossTotalCollected),
    },
    outflows: {
      operatingExpenses: numeric(fin.operatingExpenses),
      savingsTransfers: numeric(fin.savingsTransfers),
      salaryExpenses: numeric(fin.salaryExpenses),
      refunds: numeric(fin.totalRefunds),
      cashRefunds: numeric(fin.cashRefunds),
      onlineRefunds: numeric(fin.onlineRefunds),
    },
    tokens: {
      generated: Number(tokens?.generated || 0),
      converted: Number(tokens?.converted || 0),
      cancelledNoShow: Number(tokens?.cancelled_no_show || 0),
      digital: Number(tokens?.digital || 0),
      printed: Number(tokens?.printed || 0),
    },
    // Online / bank movement of this session. Never part of the physical drawer.
    online: {
      onlineSales: numeric(fin.grossQrCollected),
      creditCollectionsOnline: numeric(fin.creditCollectionsOnline),
      onlineRefunds: numeric(fin.onlineRefunds),
      onlineExpenses: numeric(fin.operatingExpensesOnline),
      salaryOnline: numeric(fin.salaryExpensesOnline),
      onlinePaidOut: numeric(fin.operatingExpensesOnline) + numeric(fin.salaryExpensesOnline),
      onlineSavings: numeric(fin.savingsFromOnline),
      netOnlineMovement: numeric(fin.netOnlineBalance),
    },
    expected,
  };
}

/** Waiting tokens are the only real Close-Store blocker in this POS (audit-confirmed). */
export async function getCloseBlockers(db, session) {
  const waiting = await db.get(
    `SELECT COUNT(*)::int AS count FROM walk_in_tokens WHERE business_day_id = ? AND status = 'WAITING'`,
    [session.business_day_id]
  );
  const waitingCount = Number(waiting?.count || 0);
  const blockers = [];
  if (waitingCount > 0) {
    blockers.push({ code: 'WAITING_TOKENS', count: waitingCount, message: `${waitingCount} token(s) are still waiting in the queue.` });
  }
  return blockers;
}

/** Session or business-day currently open, or a 409 STORE_CLOSED error for mutation APIs. */
export async function requireOpenSession(db) {
  const session = await getOpenSession(db);
  if (!session) {
    const error = new Error('The store is closed. Open the store before recording transactions.');
    error.status = 409;
    error.code = STORE_CLOSED_CODE;
    throw error;
  }
  return { sessionId: session.id, businessDayId: session.business_day_id, session };
}

function validateTransfer(direction, amount, transfer) {
  if (amount <= 0) return null; // no difference, nothing to record
  const t = transfer || {};
  const note = String(t.note || t.reason || '').replace(/[<>]/g, '').trim();
  if (direction === 'REMOVE') {
    const destination = String(t.destination || '').trim();
    if (!REMOVE_DESTINATIONS.includes(destination)) throw badRequest('Select where the removed cash goes');
    if (destination === 'OTHER' && !note) throw badRequest('A note is required for an "Other" destination');
    return { direction, kind: destination, note, paidTo: TRANSFER_LABELS[destination], paidBy: 'Drawer' };
  }
  const source = String(t.source || '').trim();
  if (!ADD_SOURCES.includes(source)) throw badRequest('Select where the added cash comes from');
  if (source === 'OTHER' && !note) throw badRequest('A note is required for an "Other" source');
  return { direction, kind: source, note, paidTo: 'Drawer', paidBy: TRANSFER_LABELS[source] };
}

/**
 * Records the opening-cash difference as a non-P&L CASH_TRANSFER on the expenses table.
 * starting_cash already reflects the post-adjustment drawer, so this row documents the
 * money's provenance/destination for the cash book WITHOUT re-reducing any balance.
 */
async function recordOpeningTransfer(tx, { businessDayId, sessionId, startingCash, previousClosingCash, transfer, userId }) {
  const diff = Math.round((startingCash - previousClosingCash) * 100) / 100;
  if (diff === 0) return null;
  const direction = diff < 0 ? 'REMOVE' : 'ADD';
  const amount = Math.abs(diff);
  const detail = validateTransfer(direction, amount, transfer);
  const title = direction === 'REMOVE'
    ? `Opening cash removed to ${detail.paidTo}`
    : `Opening cash added from ${detail.paidBy}`;
  const notes = `${direction === 'REMOVE' ? 'Removed' : 'Added'} Rs ${amount.toFixed(2)} on Store Open${detail.note ? ` — ${detail.note}` : ''}`;

  const result = await tx.run(`
    INSERT INTO expenses (
      title, category, amount, payment_method, cash_amount, online_amount,
      paid_by, paid_to, expense_date, notes, reference_number, attachment_url,
      record_type, business_day_id, store_session_id, created_by, updated_by
    ) VALUES (?, ?, ?, 'cash', ?, 0, ?, ?, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date, ?, ?, '', 'CASH_TRANSFER', ?, ?, ?, ?)
  `, [
    title, CASH_ADJUSTMENT_CATEGORY, amount, amount,
    detail.paidBy, detail.paidTo, notes, `${direction}-${detail.kind}`,
    businessDayId, sessionId, userId, userId,
  ]);
  await logAction(tx, userId, 'cash_transfer', 'store_session', sessionId, `${direction} ${amount} ${detail.kind}`);
  return { id: result.lastInsertRowid, direction, amount, kind: detail.kind, note: detail.note };
}

async function openSessionRow(tx, { businessDayId, startingCash, previousClosingCash, openingNote, transfer, userId }) {
  const numberRow = await tx.get(
    `SELECT COALESCE(MAX(session_number), 0) + 1 AS next FROM store_sessions WHERE business_day_id = ?`,
    [businessDayId]
  );
  const sessionNumber = Number(numberRow?.next || 1);
  const result = await tx.run(`
    INSERT INTO store_sessions (
      business_day_id, session_number, status, opened_by, starting_cash,
      previous_session_closing_cash, opening_note
    ) VALUES (?, ?, 'OPEN', ?, ?, ?, ?)
  `, [businessDayId, sessionNumber, userId, startingCash, previousClosingCash, openingNote || null]);
  const sessionId = result.lastInsertRowid;
  const transferRecord = await recordOpeningTransfer(tx, {
    businessDayId, sessionId, startingCash, previousClosingCash, transfer, userId,
  });
  await logAction(tx, userId, 'open_session', 'store_session', sessionId, `Session ${sessionNumber} starting ${startingCash}`);
  return { sessionId, sessionNumber, transferRecord };
}

/** One-line description of the previous session, for "Last Session" in the UI. */
async function previousSessionInfo(db, businessDayId, beforeSessionNumber = null) {
  const row = await db.get(`
    SELECT ss.session_number, ss.status, ss.closed_at, ss.counted_cash,
           COALESCE(u.full_name, u.username, '') AS closed_by_name
    FROM store_sessions ss
    LEFT JOIN users u ON u.id = ss.closed_by
    WHERE ss.business_day_id = ? AND ss.status = 'CLOSED'
      ${beforeSessionNumber ? 'AND ss.session_number < ?' : ''}
    ORDER BY ss.session_number DESC
    LIMIT 1
  `, beforeSessionNumber ? [businessDayId, beforeSessionNumber] : [businessDayId]);
  if (!row) return null;
  return {
    sessionNumber: Number(row.session_number || 0),
    closedAt: row.closed_at,
    closedBy: row.closed_by_name,
    countedCash: numeric(row.counted_cash),
  };
}

/** Full status for the header control and the Opening & Closing screen. */
export async function getStoreStatus(db) {
  const session = await getOpenSession(db);
  if (session) {
    const openedBy = await db.get(
      `SELECT COALESCE(full_name, username, '') AS name FROM users WHERE id = ?`,
      [session.opened_by]
    );
    const expected = await computeExpectedCash(db, session);
    const previous = await previousSessionInfo(db, session.business_day_id, session.session_number);
    const sessionCount = await db.get(
      `SELECT COUNT(*)::int AS count FROM store_sessions WHERE business_day_id = ?`,
      [session.business_day_id]
    );
    return {
      state: 'OPEN',
      businessDate: dateIso(session.business_date),
      businessDayId: session.business_day_id,
      sessionCount: Number(sessionCount?.count || 1),
      session: {
        id: session.id,
        sessionNumber: session.session_number,
        openedAt: session.opened_at,
        openedBy: openedBy?.name || '',
        startingCash: numeric(session.starting_cash),
        // Live drawer position — starting float plus this session's cash movement.
        expectedCash: expected.expectedCash,
        cashCollections: expected.cashCollections,
        cashOut: numeric(expected.cashExpenses) + numeric(expected.cashSavingsOut),
      },
      previousSession: previous,
    };
  }

  const openDay = await getOpenBusinessDay(db);
  if (openDay) {
    const lastClosingCash = await dayClosingCash(db, openDay.id);
    const previous = await previousSessionInfo(db, openDay.id);
    const sessionCount = await db.get(
      `SELECT COUNT(*)::int AS count FROM store_sessions WHERE business_day_id = ?`,
      [openDay.id]
    );
    // The next business day may not be dated in the future, so it can only be started once
    // the Nepal calendar has actually moved on. Surfaced here so the UI can explain that
    // rather than letting the action fail.
    const today = currentBusinessDate();
    const nextBusinessDate = maxIso(addDaysIso(openDay.business_date, 1), today);
    return {
      state: 'CLOSED_SAME_DAY',
      businessDate: dateIso(openDay.business_date),
      businessDayId: openDay.id,
      sessionCount: Number(sessionCount?.count || 0),
      previousSession: previous,
      previousClosingCash: lastClosingCash,
      suggestedStartingCash: lastClosingCash,
      nextBusinessDate,
      canStartNextDay: nextBusinessDate <= today,
      nextDayBlockedReason: nextBusinessDate <= today
        ? null
        : `${dateIso(openDay.business_date)} is still today in Nepal time. Reopen the store to keep trading, and start the next business day tomorrow.`,
    };
  }

  // No open day at all: first ever open, or after a full close with no next day started yet.
  const today = currentBusinessDate();
  const existingToday = await db.get(`SELECT * FROM business_days WHERE business_date = ?::date LIMIT 1`, [today]);
  const previousDay = await getLatestClosedDayBefore(db, today);
  const previousClosingCash = previousDay ? await dayClosingCash(db, previousDay.id) : 0;
  return {
    state: 'NO_DAY',
    businessDate: today,
    previousBusinessDate: previousDay?.business_date || null,
    previousClosingCash,
    suggestedStartingCash: previousClosingCash,
    hasClosedDayToday: Boolean(existingToday),
  };
}

function maxIso(a, b) {
  return a >= b ? a : b;
}

/** OPEN STORE — first session of a (new) business day. */
export async function openStore(db, user, input) {
  const startingCash = money(input.startingCash);
  const openingNote = String(input.openingNote || '').replace(/[<>]/g, '').trim();

  return db.transaction(async (tx) => {
    const existingOpen = await tx.get(`SELECT id FROM business_days WHERE status = 'OPEN' LIMIT 1`);
    if (existingOpen) throw badRequest('A business day is already open. Reopen the store instead.');

    const businessDate = currentBusinessDate();
    const previousDay = await getLatestClosedDayBefore(tx, businessDate);
    // First-ever open has no prior close to reconcile against: the starting cash IS the
    // baseline float, so there is no difference and no transfer step.
    const previousClosingCash = previousDay ? await dayClosingCash(tx, previousDay.id) : startingCash;

    let day = await tx.get(`SELECT * FROM business_days WHERE business_date = ?::date LIMIT 1`, [businessDate]);
    if (day) {
      await tx.run(
        `UPDATE business_days SET status = 'OPEN', updated_at = NOW() WHERE id = ?`,
        [day.id]
      );
    } else {
      const dayResult = await tx.run(`
        INSERT INTO business_days (business_date, status, opened_by, opening_cash, previous_closing_cash, opening_note)
        VALUES (?::date, 'OPEN', ?, ?, ?, ?)
      `, [businessDate, user.id, startingCash, previousClosingCash, openingNote || null]);
      day = { id: dayResult.lastInsertRowid };
      await logAction(tx, user.id, 'open_business_day', 'business_day', day.id, businessDate);
    }

    const session = await openSessionRow(tx, {
      businessDayId: day.id, startingCash, previousClosingCash, openingNote, transfer: input.transfer, userId: user.id,
    });
    return { businessDayId: day.id, businessDate, ...session };
  });
}

/** REOPEN STORE — a new session under the SAME business day. Totals are not reset. */
export async function reopenStore(db, user, input) {
  const startingCash = money(input.startingCash);
  const openingNote = String(input.openingNote || '').replace(/[<>]/g, '').trim();

  return db.transaction(async (tx) => {
    const day = await tx.get(`SELECT * FROM business_days WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1`);
    if (!day) throw badRequest('No current business day to reopen. Start a business day instead.');
    const openSession = await tx.get(`SELECT id FROM store_sessions WHERE status = 'OPEN' LIMIT 1`);
    if (openSession) throw badRequest('The store is already open.');

    const previousClosingCash = await dayClosingCash(tx, day.id);
    const session = await openSessionRow(tx, {
      businessDayId: day.id, startingCash, previousClosingCash, openingNote, transfer: input.transfer, userId: user.id,
    });
    return { businessDayId: day.id, businessDate: day.business_date, ...session };
  });
}

/** START NEXT BUSINESS DAY — close the current day, open the next one fresh. */
export async function startNextBusinessDay(db, user, input) {
  const startingCash = money(input.startingCash);
  const openingNote = String(input.openingNote || '').replace(/[<>]/g, '').trim();

  return db.transaction(async (tx) => {
    const current = await tx.get(`SELECT * FROM business_days WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1`);
    if (!current) throw badRequest('There is no current business day to advance.');
    const openSession = await tx.get(`SELECT id FROM store_sessions WHERE status = 'OPEN' LIMIT 1`);
    if (openSession) throw badRequest('Close the store before starting the next business day.');

    // Close the current day. Cash balances are SNAPSHOTS, never sums: the day's expected and
    // counted cash are the FINAL session's figures. Summing session balances would count the
    // cash carried from one session into the next twice. Only cash_difference is additive,
    // because each session's shortage/overage is a separate real event.
    const finalSession = await getLastClosedSession(tx, current.id);
    const diffAgg = await tx.get(
      `SELECT COALESCE(SUM(cash_difference), 0) AS diff FROM store_sessions WHERE business_day_id = ? AND status = 'CLOSED'`,
      [current.id]
    );
    const carriedCash = numeric(finalSession?.counted_cash);
    await tx.run(`
      UPDATE business_days
      SET status = 'CLOSED', closed_by = ?, closed_at = NOW(),
          expected_cash = ?, counted_cash = ?, cash_difference = ?, updated_at = NOW()
      WHERE id = ?
    `, [user.id, numeric(finalSession?.expected_cash), carriedCash, numeric(diffAgg?.diff), current.id]);
    await logAction(tx, user.id, 'close_business_day', 'business_day', current.id, current.business_date);

    // A business day may never be dated in the future. Without this guard, running
    // "Start Next Business Day" twice in one calendar day produced a day dated tomorrow:
    // its transactions then sat outside every calendar-window report (Last 3 / 7 Days,
    // This Month), and a bill entered for the real calendar date looked "backdated"
    // against it. maxIso still lets a stale day catch up to today in one step.
    const today = currentBusinessDate();
    const nextDate = maxIso(addDaysIso(current.business_date, 1), today);
    if (nextDate > today) {
      throw badRequest(
        `Business day ${dateIso(current.business_date)} is still the current operational day in Nepal time. `
        + 'Reopen the store to keep trading today, and start the next business day tomorrow.'
      );
    }
    const clash = await tx.get(`SELECT id FROM business_days WHERE business_date = ?::date LIMIT 1`, [nextDate]);
    if (clash) throw badRequest('A business day already exists for the next date.');

    const dayResult = await tx.run(`
      INSERT INTO business_days (business_date, status, opened_by, opening_cash, previous_closing_cash, opening_note)
      VALUES (?::date, 'OPEN', ?, ?, ?, ?)
    `, [nextDate, user.id, startingCash, carriedCash, openingNote || null]);
    const businessDayId = dayResult.lastInsertRowid;
    await logAction(tx, user.id, 'open_business_day', 'business_day', businessDayId, nextDate);

    const session = await openSessionRow(tx, {
      businessDayId, startingCash, previousClosingCash: carriedCash, openingNote, transfer: input.transfer, userId: user.id,
    });
    return { businessDayId, businessDate: nextDate, ...session };
  });
}

/** CLOSE STORE — reconcile and close the open session. Business day stays current. */
export async function closeStore(db, user, input) {
  // A note breakdown, when supplied, is the source of the counted total — the server re-sums
  // it rather than trusting a figure computed in the browser.
  const breakdown = normalizeDenominations(input.denominations);
  const countedCash = breakdown ? money(breakdown.total) : money(input.countedCash);
  const closingNote = String(input.closingNote || '').replace(/[<>]/g, '').trim();
  const force = Boolean(input.force);
  const forceReason = String(input.forceReason || '').replace(/[<>]/g, '').trim();

  return db.transaction(async (tx) => {
    const session = await tx.get(`
      SELECT ss.*, bd.business_date FROM store_sessions ss
      JOIN business_days bd ON bd.id = ss.business_day_id
      WHERE ss.status = 'OPEN' ORDER BY ss.id DESC LIMIT 1
    `);
    if (!session) throw badRequest('The store is already closed.');

    const blockers = await getCloseBlockers(tx, session);
    if (blockers.length > 0 && !force) {
      const error = new Error('Resolve the pending items or force close.');
      error.status = 409;
      error.code = 'CLOSE_BLOCKED';
      error.blockers = blockers;
      throw error;
    }
    if (blockers.length > 0 && force) {
      if (user.role !== 'admin') {
        const error = new Error('Only an admin can force close the store.');
        error.status = 403;
        throw error;
      }
      if (!forceReason) throw badRequest('A reason is required to force close the store.');
    }

    const expected = await computeExpectedCash(tx, session);
    const difference = Math.round((countedCash - expected.expectedCash) * 100) / 100;

    await tx.run(`
      UPDATE store_sessions
      SET status = 'CLOSED', closed_by = ?, closed_at = NOW(),
          expected_cash = ?, counted_cash = ?, cash_difference = ?, closing_note = ?,
          force_closed = ?, force_close_reason = ?, cash_denominations = ?::jsonb, updated_at = NOW()
      WHERE id = ?
    `, [
      user.id, expected.expectedCash, countedCash, difference, closingNote || null,
      force && blockers.length > 0, force && blockers.length > 0 ? forceReason : null,
      breakdown ? JSON.stringify(breakdown.counts) : null, session.id,
    ]);

    await logAction(
      tx, user.id, force && blockers.length > 0 ? 'force_close_session' : 'close_session',
      'store_session', session.id,
      `expected ${expected.expectedCash} counted ${countedCash} diff ${difference}`
    );

    return {
      sessionId: session.id,
      expectedCash: expected.expectedCash,
      countedCash,
      difference,
      denominations: breakdown ? breakdown.counts : null,
      status: difference === 0 ? 'MATCHED' : difference < 0 ? 'SHORT' : 'OVER',
      forced: force && blockers.length > 0,
    };
  });
}

/**
 * Admin Business Day History — one row per day, with its store sessions attached.
 *
 * CASH BALANCES ARE NEVER SUMMED ACROSS SESSIONS. Starting cash is the FIRST session's
 * float; expected and counted cash are the FINAL session's closing figures. Session 2 that
 * starts with Session 1's counted cash is holding the SAME physical notes, so adding the
 * two balances would report money that does not exist. Only cash_difference is additive:
 * each session's shortage or overage is a distinct event.
 */
export async function getBusinessDayHistory(db, { limit = 60 } = {}) {
  const rows = await db.all(`
    SELECT
      bd.id, bd.business_date, bd.status, bd.opened_at, bd.closed_at,
      COALESCE(ob.full_name, ob.username, '') AS opened_by_name,
      COALESCE(cb.full_name, cb.username, '') AS closed_by_name,
      COUNT(ss.id)::int AS session_count,
      COUNT(CASE WHEN ss.status = 'OPEN' THEN 1 END)::int AS open_sessions,
      COALESCE(SUM(ss.cash_difference), 0) AS sessions_difference
    FROM business_days bd
    LEFT JOIN store_sessions ss ON ss.business_day_id = bd.id
    LEFT JOIN users ob ON ob.id = bd.opened_by
    LEFT JOIN users cb ON cb.id = bd.closed_by
    GROUP BY bd.id, ob.full_name, ob.username, cb.full_name, cb.username
    ORDER BY bd.business_date DESC, bd.id DESC
    LIMIT ?
  `, [limit]);

  const dayIds = rows.map((row) => row.id);
  if (dayIds.length === 0) return [];
  const placeholders = dayIds.map(() => '?').join(',');

  const sessionRows = await db.all(`
    SELECT
      ss.id, ss.business_day_id, ss.session_number, ss.status,
      ss.opened_at, ss.closed_at, ss.starting_cash, ss.expected_cash,
      ss.counted_cash, ss.cash_difference, ss.force_closed, ss.force_close_reason,
      ss.cash_denominations, ss.opening_note, ss.closing_note,
      COALESCE(so.full_name, so.username, '') AS opened_by_name,
      COALESCE(sc.full_name, sc.username, '') AS closed_by_name
    FROM store_sessions ss
    LEFT JOIN users so ON so.id = ss.opened_by
    LEFT JOIN users sc ON sc.id = ss.closed_by
    WHERE ss.business_day_id IN (${placeholders})
    ORDER BY ss.business_day_id ASC, ss.session_number ASC, ss.id ASC
  `, dayIds);

  const sessionsByDay = sessionRows.reduce((acc, row) => {
    const key = String(row.business_day_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      id: row.id,
      sessionNumber: Number(row.session_number || 0),
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openedBy: row.opened_by_name,
      closedBy: row.closed_by_name,
      startingCash: numeric(row.starting_cash),
      expectedCash: numeric(row.expected_cash),
      countedCash: numeric(row.counted_cash),
      difference: numeric(row.cash_difference),
      forceClosed: Boolean(row.force_closed),
      forceCloseReason: row.force_close_reason || null,
      denominations: row.cash_denominations || null,
      openingNote: row.opening_note || null,
      closingNote: row.closing_note || null,
    });
    return acc;
  }, {});

  // Sales are attributed by REVENUE business day, so a backdated bill recorded during this
  // day does not inflate it — matching every other business-day figure in the app.
  const salesByDay = await db.all(`
    SELECT
      (CASE
        WHEN b.backdated_by IS NOT NULL THEN b.revenue_business_day_id
        ELSE COALESCE(b.revenue_business_day_id, b.business_day_id)
      END) AS report_day_id,
      COALESCE(SUM(b.grand_total), 0) AS net_sales,
      COUNT(b.id)::int AS bills
    FROM salon_bills b
    WHERE (CASE
        WHEN b.backdated_by IS NOT NULL THEN b.revenue_business_day_id
        ELSE COALESCE(b.revenue_business_day_id, b.business_day_id)
      END) IN (${placeholders})
      AND ${PAID_BILL_STATUS_SQL}
    GROUP BY 1
  `, dayIds);
  const salesMap = new Map(salesByDay.map((row) => [String(row.report_day_id), row]));

  // Voids reduce the sales of the day they were PROCESSED on (same rule as getFinancialSummary).
  const voidsByDay = await db.all(`
    SELECT fc.business_day_id, COALESCE(SUM(fc.amount), 0) AS voided, COUNT(fc.id)::int AS void_count
    FROM financial_corrections fc
    WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void'
      AND fc.business_day_id IN (${placeholders})
    GROUP BY fc.business_day_id
  `, dayIds);
  const voidMap = new Map(voidsByDay.map((row) => [String(row.business_day_id), row]));

  const today = currentBusinessDate();

  return rows.map((row) => {
    const sales = salesMap.get(String(row.id));
    const sessions = sessionsByDay[String(row.id)] || [];
    const closedSessions = sessions.filter((session) => session.status === 'CLOSED');
    const finalSession = closedSessions[closedSessions.length - 1] || null;
    const isOpen = Number(row.open_sessions || 0) > 0;
    const businessDate = dateIso(row.business_date);

    return {
      id: row.id,
      businessDate,
      // Legacy rows only: creating a future-dated day is blocked since 2026-08-11. Flagged
      // because such a day's transactions sit outside every calendar-window report until the
      // calendar reaches that date. See docs/migrations/2026-08-11-fix-future-business-days.sql.
      futureDated: businessDate > today,
      status: isOpen ? 'OPEN' : row.status,
      sessions: Number(row.session_count || 0),
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openedBy: row.opened_by_name,
      closedBy: row.closed_by_name,
      // First session's float — the cash the day actually started with.
      startingCash: sessions.length > 0 ? sessions[0].startingCash : 0,
      // Final session's closing figures — never a sum of session balances.
      finalExpectedCash: finalSession ? finalSession.expectedCash : null,
      finalCountedCash: finalSession ? finalSession.countedCash : null,
      // Additive on purpose: every session shortage/overage is a separate event.
      difference: numeric(row.sessions_difference),
      grossBilled: numeric(sales?.net_sales),
      voids: numeric(voidMap.get(String(row.id))?.voided),
      voidCount: Number(voidMap.get(String(row.id))?.void_count || 0),
      netSales: Math.round((numeric(sales?.net_sales) - numeric(voidMap.get(String(row.id))?.voided)) * 100) / 100,
      bills: Number(sales?.bills || 0),
      sessionDetails: sessions,
    };
  });
}
