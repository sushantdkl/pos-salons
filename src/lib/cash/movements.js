/**
 * CASH IN / CASH OUT and CASH EXCHANGE.
 *
 * Money that changes what the salon holds WITHOUT being a sale or an expense:
 *
 *   CASH_IN   owner adds cash, bank withdrawal, money from the safe  -> business cash  +
 *   CASH_OUT  owner withdrawal, bank deposit, money to the safe       -> business cash  -
 *   EXCHANGE  ONLINE_TO_CASH  customer pays online, takes cash       -> online + amount, cash - (amount - charge)
 *             CASH_TO_ONLINE  customer gives cash, takes online      -> cash + amount, online - (amount - charge)
 *             The charge the salon keeps is fee income (the only P&L effect of this module).
 *
 * Every row belongs to the open store session, so Expected Cash in Drawer, the Business Day and
 * every report pick it up through finance-summary's getCashMovementTotals — one formula.
 *
 * Nothing is ever edited or deleted. A mistake is corrected by a linked REVERSAL row with the
 * legs negated, posted in the session that is open NOW. A closed day's figures therefore never
 * change, and the original and its reversal stay visible side by side.
 */

import { logAction } from '@/lib/db/helpers';
import { assertDrawerCashAvailable, requireOpenSession } from '@/lib/business-day/service';
import { numeric } from '@/lib/reports/finance-summary';
import { periodDateColumnFilter } from '@/lib/db/postgres-dates';
import { DASHBOARD_PERIODS } from '@/lib/reports/dashboard-period';

export const CASH_IN_REASONS = {
  OWNER_CONTRIBUTION: 'Owner added cash',
  BANK_WITHDRAWAL: 'Bank withdrawal',
  FROM_SAFE: 'From safe / reserve',
  CHANGE_FLOAT: 'Change / float added',
  OTHER: 'Other',
};

export const CASH_OUT_REASONS = {
  OWNER_WITHDRAWAL: 'Owner withdrawal',
  BANK_DEPOSIT: 'Bank deposit',
  TO_SAFE: 'To safe / reserve',
  OTHER: 'Other',
};

export const EXCHANGE_DIRECTIONS = {
  ONLINE_TO_CASH: 'Customer paid online, took cash',
  CASH_TO_ONLINE: 'Customer gave cash, took online',
};

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const clean = (value) => String(value ?? '').replace(/[<>]/g, '').trim();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function positiveAmount(value, label = 'Amount') {
  const amount = round2(value);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest(`${label} must be greater than zero`);
  return amount;
}

export function reasonLabel(row) {
  if (row.movement_type === 'EXCHANGE') return EXCHANGE_DIRECTIONS[row.exchange_direction] || 'Exchange';
  const table = row.movement_type === 'CASH_IN' ? CASH_IN_REASONS : CASH_OUT_REASONS;
  return table[row.reason] || row.reason;
}

export function mapMovement(row) {
  return {
    id: Number(row.id),
    type: row.movement_type,
    reason: row.reason,
    reasonLabel: reasonLabel(row),
    direction: row.exchange_direction || null,
    amount: numeric(row.amount),
    charge: numeric(row.charge),
    cashIn: numeric(row.cash_in),
    cashOut: numeric(row.cash_out),
    onlineIn: numeric(row.online_in),
    onlineOut: numeric(row.online_out),
    feeIncome: numeric(row.fee_income),
    note: row.note || '',
    referenceNumber: row.reference_number || '',
    date: row.movement_date,
    status: row.status,
    reversesId: row.reverses_id ? Number(row.reverses_id) : null,
    reversedById: row.reversed_by_id ? Number(row.reversed_by_id) : null,
    businessDayId: row.business_day_id ? Number(row.business_day_id) : null,
    businessDate: row.business_date || null,
    storeSessionId: row.store_session_id ? Number(row.store_session_id) : null,
    sessionNumber: row.session_number ? Number(row.session_number) : null,
    createdBy: row.created_by_name || '',
    createdAt: row.created_at,
  };
}

/** The four signed legs of a new movement. */
export function movementLegs({ type, direction, amount, charge = 0 }) {
  if (type === 'CASH_IN') return { cashIn: amount, cashOut: 0, onlineIn: 0, onlineOut: 0, fee: 0 };
  if (type === 'CASH_OUT') return { cashIn: 0, cashOut: amount, onlineIn: 0, onlineOut: 0, fee: 0 };
  const payout = round2(amount - charge);
  if (direction === 'ONLINE_TO_CASH') return { cashIn: 0, cashOut: payout, onlineIn: amount, onlineOut: 0, fee: charge };
  return { cashIn: amount, cashOut: 0, onlineIn: 0, onlineOut: payout, fee: charge };
}

async function findByKey(db, key) {
  if (!key) return null;
  return db.get('SELECT * FROM cash_movements WHERE idempotency_key = ?', [key]);
}

/** Record a Cash In, Cash Out or Exchange in the open session. */
export async function recordMovement(db, user, input) {
  const type = String(input.type || '').toUpperCase();
  if (!['CASH_IN', 'CASH_OUT', 'EXCHANGE'].includes(type)) throw badRequest('Choose Cash In, Cash Out or Exchange');

  const amount = positiveAmount(input.amount);
  let reason = clean(input.reason).toUpperCase();
  let direction = null;
  let charge = 0;

  if (type === 'EXCHANGE') {
    direction = clean(input.direction).toUpperCase();
    if (!EXCHANGE_DIRECTIONS[direction]) throw badRequest('Choose which way the money is exchanged');
    charge = round2(input.charge || 0);
    if (!Number.isFinite(charge) || charge < 0) throw badRequest('Charge cannot be negative');
    if (charge >= amount) throw badRequest('Charge must be less than the amount');
    reason = direction;
  } else {
    const reasons = type === 'CASH_IN' ? CASH_IN_REASONS : CASH_OUT_REASONS;
    if (!reasons[reason]) throw badRequest(`Choose why the cash is ${type === 'CASH_IN' ? 'coming in' : 'going out'}`);
  }

  const note = clean(input.note).slice(0, 500);
  if (type !== 'EXCHANGE' && !note) throw badRequest('A note is required — say who and why');
  const referenceNumber = clean(input.referenceNumber).slice(0, 80) || null;
  const idempotencyKey = clean(input.idempotencyKey).slice(0, 120) || null;

  const existing = await findByKey(db, idempotencyKey);
  if (existing) return { movement: mapMovement(existing), duplicate: true };

  const scope = await requireOpenSession(db);
  const legs = movementLegs({ type, direction, amount, charge });

  return db.transaction(async (tx) => {
    // Cash cannot leave a drawer that does not hold it — same guard as every other payout.
    if (legs.cashOut > 0) {
      await assertDrawerCashAvailable(tx, legs.cashOut, {
        label: type === 'EXCHANGE' ? 'exchange cash payout' : 'cash out',
      });
    }
    const day = await tx.get('SELECT business_date FROM business_days WHERE id = ?', [scope.businessDayId]);
    const result = await tx.run(`
      INSERT INTO cash_movements (
        movement_type, reason, exchange_direction, amount, charge,
        cash_in, cash_out, online_in, online_out, fee_income,
        note, reference_number, movement_date, status,
        business_day_id, store_session_id, idempotency_key, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::date, 'ACTIVE', ?, ?, ?, ?)
    `, [
      type, reason, direction, amount, charge,
      legs.cashIn, legs.cashOut, legs.onlineIn, legs.onlineOut, legs.fee,
      note || EXCHANGE_DIRECTIONS[direction] || '', referenceNumber, day?.business_date || null,
      scope.businessDayId, scope.sessionId, idempotencyKey, user.id,
    ]);
    const id = result.lastInsertRowid;
    await logAction(tx, user.id, `cash_${type.toLowerCase()}`, 'cash_movement', id, `${reason} ${amount}${charge ? ` charge ${charge}` : ''}`);
    return { movement: mapMovement(await getMovementRow(tx, id)) };
  });
}

/** Reverse a movement with a reason. The reversal is posted in the session open now. */
export async function reverseMovement(db, user, { id, reason }) {
  const note = clean(reason).slice(0, 500);
  if (!note) throw badRequest('A reason is required to reverse an entry');
  const scope = await requireOpenSession(db);

  return db.transaction(async (tx) => {
    const original = await tx.get('SELECT * FROM cash_movements WHERE id = ? FOR UPDATE', [Number(id)]);
    if (!original) { const error = new Error('Entry not found'); error.status = 404; throw error; }
    if (original.status === 'REVERSAL') throw badRequest('A reversal cannot itself be reversed');
    if (original.status === 'REVERSED') throw badRequest('This entry has already been reversed');

    // Undoing money that came IN takes that cash back out of the drawer.
    const cashBackOut = round2(numeric(original.cash_in) - numeric(original.cash_out));
    if (cashBackOut > 0) await assertDrawerCashAvailable(tx, cashBackOut, { label: 'reversal' });

    const day = await tx.get('SELECT business_date FROM business_days WHERE id = ?', [scope.businessDayId]);
    const result = await tx.run(`
      INSERT INTO cash_movements (
        movement_type, reason, exchange_direction, amount, charge,
        cash_in, cash_out, online_in, online_out, fee_income,
        note, reference_number, movement_date, status, reverses_id,
        business_day_id, store_session_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::date, 'REVERSAL', ?, ?, ?, ?)
    `, [
      original.movement_type, original.reason, original.exchange_direction, original.amount, original.charge,
      -numeric(original.cash_in), -numeric(original.cash_out), -numeric(original.online_in), -numeric(original.online_out), -numeric(original.fee_income),
      note, original.reference_number, day?.business_date || null, original.id,
      scope.businessDayId, scope.sessionId, user.id,
    ]);
    const reversalId = result.lastInsertRowid;
    await tx.run(`UPDATE cash_movements SET status = 'REVERSED', reversed_by_id = ? WHERE id = ?`, [reversalId, original.id]);
    await logAction(tx, user.id, 'reverse_cash_movement', 'cash_movement', original.id, note);
    return { movement: mapMovement(await getMovementRow(tx, reversalId)) };
  });
}

const SELECT_MOVEMENT = `
  SELECT m.*, bd.business_date, ss.session_number, COALESCE(u.full_name, u.username, '') AS created_by_name
  FROM cash_movements m
  LEFT JOIN business_days bd ON bd.id = m.business_day_id
  LEFT JOIN store_sessions ss ON ss.id = m.store_session_id
  LEFT JOIN users u ON u.id = m.created_by
`;

export async function getMovementRow(db, id) {
  return db.get(`${SELECT_MOVEMENT} WHERE m.id = ?`, [Number(id)]);
}

/** One movement with its reversal partner, for the detail panel. */
export async function getMovementDetail(db, id) {
  const row = await getMovementRow(db, id);
  if (!row) return null;
  const partnerId = row.reversed_by_id || row.reverses_id;
  const partner = partnerId ? await getMovementRow(db, partnerId) : null;
  return { movement: mapMovement(row), partner: partner ? mapMovement(partner) : null };
}

/**
 * Paged history. `kind` = 'cash' (Cash In + Cash Out) or 'exchange'. Totals cover the whole
 * filtered range, not just the page.
 */
export async function listMovements(db, params = {}) {
  const clauses = [];
  const values = [];
  if (params.kind === 'exchange') clauses.push(`m.movement_type = 'EXCHANGE'`);
  else if (params.kind === 'cash') clauses.push(`m.movement_type IN ('CASH_IN', 'CASH_OUT')`);
  const direction = clean(params.direction).toUpperCase();
  if (['CASH_IN', 'CASH_OUT'].includes(direction)) { clauses.push('m.movement_type = ?'); values.push(direction); }
  if (EXCHANGE_DIRECTIONS[direction]) { clauses.push('m.exchange_direction = ?'); values.push(direction); }
  // Period presets (Today … Custom Range) use the same bounds as every report.
  const period = clean(params.period);
  if (period && period !== 'all' && DASHBOARD_PERIODS[period]) {
    const bounded = period !== 'custom' || (params.startDate && params.endDate);
    if (bounded) {
      const filter = periodDateColumnFilter(period, 'm.movement_date', params.startDate, params.endDate);
      clauses.push(filter.clause);
      values.push(...filter.params);
    }
  }
  const from = clean(params.from);
  const to = clean(params.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { clauses.push('m.movement_date >= ?::date'); values.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { clauses.push('m.movement_date <= ?::date'); values.push(to); }
  if (params.businessDayId) { clauses.push('m.business_day_id = ?'); values.push(Number(params.businessDayId)); }
  const search = clean(params.search);
  if (search) {
    clauses.push(`(m.note ILIKE ? OR m.reason ILIKE ? OR COALESCE(m.reference_number, '') ILIKE ? OR COALESCE(u.full_name, u.username, '') ILIKE ? OR CAST(m.id AS TEXT) = ?)`);
    values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const pageSize = [10, 25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number.parseInt(params.page, 10) || 1);

  const totals = await db.get(`
    SELECT COUNT(*)::int AS count,
      COALESCE(SUM(m.cash_in), 0) AS cash_in, COALESCE(SUM(m.cash_out), 0) AS cash_out,
      COALESCE(SUM(m.online_in), 0) AS online_in, COALESCE(SUM(m.online_out), 0) AS online_out,
      COALESCE(SUM(m.fee_income), 0) AS fee_income
    FROM cash_movements m LEFT JOIN users u ON u.id = m.created_by ${where}
  `, values);
  const rows = await db.all(`${SELECT_MOVEMENT} ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]);
  const count = Number(totals?.count || 0);
  return {
    rows: rows.map(mapMovement),
    pagination: { page, pageSize, total: count, pages: Math.max(1, Math.ceil(count / pageSize)) },
    totals: {
      cashIn: numeric(totals?.cash_in), cashOut: numeric(totals?.cash_out),
      onlineIn: numeric(totals?.online_in), onlineOut: numeric(totals?.online_out),
      feeIncome: numeric(totals?.fee_income),
    },
  };
}
