import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { mapApiError } from '@/lib/db/api-errors';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { salonDateString } from '@/lib/reports/dashboard-period';
import { requireOpenSession } from '@/lib/business-day/service';
import {
  DEPOSIT_SOURCE_ACCOUNTS,
  DEPOSIT_SOURCE_LABELS,
  DEPOSIT_TYPE_LABELS,
  DEPOSIT_TYPES,
  getFinancialSummary,
  numeric,
} from '@/lib/reports/finance-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERIODS = ['today', '3days', '7days', 'month'];

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Amount must be greater than zero');
  return Math.round(parsed * 100) / 100;
}

function mapDeposit(row) {
  return {
    id: row.id,
    depositType: row.deposit_type,
    depositTypeLabel: DEPOSIT_TYPE_LABELS[row.deposit_type] || row.deposit_type,
    amount: numeric(row.amount),
    sourceAccount: row.source_account,
    sourceAccountLabel: DEPOSIT_SOURCE_LABELS[row.source_account] || row.source_account,
    institutionName: row.institution_name || '',
    referenceNumber: row.reference_number || '',
    notes: row.notes || '',
    depositDate: row.deposit_date,
    status: row.status,
    createdByName: row.created_by_name || '',
    createdById: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildFilters(searchParams, restrictToUserId) {
  const clauses = ['s.deleted_at IS NULL'];
  const params = [];

  if (restrictToUserId) {
    clauses.push('s.created_by = ?');
    params.push(restrictToUserId);
  }

  const search = cleanText(searchParams.get('search'), '');
  if (search) {
    clauses.push('(s.institution_name ILIKE ? OR s.reference_number ILIKE ? OR s.notes ILIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }

  const depositType = cleanText(searchParams.get('depositType'), '');
  if (depositType && depositType !== 'all') {
    if (!DEPOSIT_TYPES.includes(depositType)) throw new Error('Invalid deposit type filter');
    clauses.push('s.deposit_type = ?');
    params.push(depositType);
  }

  const sourceAccount = cleanText(searchParams.get('sourceAccount'), '');
  if (sourceAccount && sourceAccount !== 'all') {
    if (!DEPOSIT_SOURCE_ACCOUNTS.includes(sourceAccount)) throw new Error('Invalid source account filter');
    clauses.push('s.source_account = ?');
    params.push(sourceAccount);
  }

  const status = cleanText(searchParams.get('status'), '');
  if (status && status !== 'all') {
    if (!['ACTIVE', 'CANCELLED'].includes(status)) throw new Error('Invalid status filter');
    clauses.push('s.status = ?');
    params.push(status);
  }

  const from = cleanText(searchParams.get('from'), '');
  if (from) {
    clauses.push('s.deposit_date >= ?::date');
    params.push(from);
  }
  const to = cleanText(searchParams.get('to'), '');
  if (to) {
    clauses.push('s.deposit_date <= ?::date');
    params.push(to);
  }

  return { where: clauses.join(' AND '), params };
}

/** Savings totals for each standard period, so the page can show day / 3-day / 7-day / month at once. */
async function getPeriodTotals(db, restrictToUserId) {
  const entries = await Promise.all(PERIODS.map(async (period) => {
    const summary = await getFinancialSummary(db, period, {
      createdBy: restrictToUserId || null,
      includeSalary: !restrictToUserId,
    });
    return [period, {
      label: summary.period.label,
      displayRange: summary.period.displayRange,
      savingsTransfers: summary.savingsTransfers,
      savingsFromCash: summary.savingsFromCash,
      savingsFromOnline: summary.savingsFromOnline,
      bankDeposits: summary.bankDeposits,
      sahakariDeposits: summary.sahakariDeposits,
      otherSavings: summary.otherSavings,
      records: summary.savingsRecords,
      netCashInHand: summary.netCashInHand,
      netOnlineBalance: summary.netOnlineBalance,
      netAvailableBalance: summary.netAvailableBalance,
    }];
  }));
  return Object.fromEntries(entries);
}

function validateDepositInput(data) {
  const depositType = cleanText(data.depositType || data.deposit_type, '');
  if (!DEPOSIT_TYPES.includes(depositType)) throw new Error('Select a deposit type');

  const sourceAccount = cleanText(data.sourceAccount || data.source_account, '');
  if (!DEPOSIT_SOURCE_ACCOUNTS.includes(sourceAccount)) throw new Error('Select a source account');

  const amount = money(data.amount);
  const depositDate = cleanText(data.depositDate || data.deposit_date, salonDateString());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depositDate)) throw new Error('Deposit date must be YYYY-MM-DD');
  if (depositDate > salonDateString()) throw new Error('Future deposit dates are not allowed');

  const institutionName = cleanText(data.institutionName || data.institution_name, '');
  if (depositType !== 'OTHER_SAVING' && !institutionName) {
    throw new Error('Bank or Sahakari name is required for this deposit type');
  }

  return {
    depositType,
    sourceAccount,
    amount,
    depositDate,
    institutionName,
    referenceNumber: cleanText(data.referenceNumber || data.reference_number, ''),
    notes: cleanText(data.notes, ''),
  };
}

/**
 * A deposit may not move more money than the account actually holds.
 * `excludeId` lets an edit re-check the balance without counting its own previous amount.
 */
async function assertBalanceAvailable(tx, input, user, excludeId = null) {
  if (user.role === 'admin' && (input.allowOverdraw === true)) return;

  const summary = await getFinancialSummary(tx, 'month');
  let available = input.sourceAccount === 'CASH' ? summary.netCashInHand : summary.netOnlineBalance;

  if (excludeId) {
    const previous = await tx.get(
      "SELECT amount, source_account FROM savings_deposits WHERE id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
      [excludeId]
    );
    if (previous && previous.source_account === input.sourceAccount) {
      available += numeric(previous.amount);
    }
  }

  if (input.amount > available + 0.01) {
    const label = input.sourceAccount === 'CASH' ? 'cash in hand' : 'online balance';
    throw new Error(
      `Deposit of Rs ${input.amount.toFixed(2)} exceeds the available ${label} of Rs ${Math.max(0, available).toFixed(2)} for this month.`
    );
  }
}

/** Blocks an accidental double form submission without blocking a genuine repeat deposit. */
async function assertNotDuplicateSubmission(tx, input, userId) {
  const duplicate = await tx.get(`
    SELECT id FROM savings_deposits
    WHERE deleted_at IS NULL
      AND status = 'ACTIVE'
      AND created_by = ?
      AND deposit_date = ?::date
      AND deposit_type = ?
      AND source_account = ?
      AND amount = ?
      AND created_at > NOW() - INTERVAL '2 minutes'
    LIMIT 1
  `, [userId, input.depositDate, input.depositType, input.sourceAccount, input.amount]);

  if (duplicate) {
    throw new Error('An identical deposit was just recorded. Refresh the list before adding it again.');
  }
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const { searchParams } = new URL(request.url);

    // A cashier sees only the deposits they recorded; an admin sees everything.
    const restrictToUserId = user.role === 'admin' ? null : user.id;
    const { where, params } = buildFilters(searchParams, restrictToUserId);

    const rows = await db.all(`
      SELECT s.*, COALESCE(c.full_name, c.username, '') as created_by_name
      FROM savings_deposits s
      LEFT JOIN users c ON c.id = s.created_by
      WHERE ${where}
      ORDER BY s.deposit_date DESC, s.id DESC
      LIMIT 300
    `, params);

    return NextResponse.json({
      role: user.role,
      canEdit: user.role === 'admin',
      deposits: rows.map(mapDeposit),
      totals: await getPeriodTotals(db, restrictToUserId),
      depositTypes: DEPOSIT_TYPES.map((value) => ({ value, label: DEPOSIT_TYPE_LABELS[value] })),
      sourceAccounts: DEPOSIT_SOURCE_ACCOUNTS.map((value) => ({ value, label: DEPOSIT_SOURCE_LABELS[value] })),
    });
  } catch (error) {
    console.error('Savings deposits load failed:', error);
    const mapped = mapApiError(error, 'Failed to load savings deposits');
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
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const input = validateDepositInput(data);
    const { sessionId, businessDayId } = await requireOpenSession(db);

    if (user.role !== 'admin' && input.depositDate !== salonDateString()) {
      const error = new Error('Cashier can only record same-day savings deposits');
      error.status = 403;
      throw error;
    }

    const id = await db.transaction(async (tx) => {
      await assertNotDuplicateSubmission(tx, input, user.id);
      await assertBalanceAvailable(tx, { ...input, allowOverdraw: data.allowOverdraw === true }, user);

      const result = await tx.run(`
        INSERT INTO savings_deposits (
          deposit_type, amount, source_account, institution_name, reference_number,
          notes, deposit_date, status, created_by, updated_by, business_day_id, store_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?::date, 'ACTIVE', ?, ?, ?, ?)
      `, [
        input.depositType, input.amount, input.sourceAccount, input.institutionName || null,
        input.referenceNumber || null, input.notes || null, input.depositDate, user.id, user.id,
        businessDayId, sessionId,
      ]);
      const depositId = result.lastInsertRowid;
      await logAction(tx, user.id, 'create', 'savings_deposit', depositId, `${input.depositType} ${input.amount}`);
      return depositId;
    });

    return NextResponse.json({ message: 'Savings deposit recorded', id }, { status: 201 });
  } catch (error) {
    console.error('Savings deposit create failed:', error);
    const mapped = mapApiError(error, 'Failed to record savings deposit');
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
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const id = Number(data.id || 0);
    if (!id) return NextResponse.json({ error: 'Deposit ID is required' }, { status: 400 });
    const input = validateDepositInput(data);

    await db.transaction(async (tx) => {
      const existing = await tx.get(
        'SELECT id, status FROM savings_deposits WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
      if (!existing) {
        const error = new Error('Savings deposit was not found');
        error.status = 404;
        throw error;
      }
      if (existing.status === 'CANCELLED') throw new Error('A cancelled deposit cannot be edited');

      await assertBalanceAvailable(tx, { ...input, allowOverdraw: data.allowOverdraw === true }, user, id);

      await tx.run(`
        UPDATE savings_deposits
        SET deposit_type = ?, amount = ?, source_account = ?, institution_name = ?,
            reference_number = ?, notes = ?, deposit_date = ?::date, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
      `, [
        input.depositType, input.amount, input.sourceAccount, input.institutionName || null,
        input.referenceNumber || null, input.notes || null, input.depositDate, user.id, id,
      ]);
      await logAction(tx, user.id, 'update', 'savings_deposit', id, `${input.depositType} ${input.amount}`);
    });

    return NextResponse.json({ message: 'Savings deposit updated', id });
  } catch (error) {
    console.error('Savings deposit update failed:', error);
    const mapped = mapApiError(error, 'Failed to update savings deposit');
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
    const user = await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || 0);
    if (!id) return NextResponse.json({ error: 'Deposit ID is required' }, { status: 400 });
    const reason = cleanText(searchParams.get('reason'), '');

    // Cancelled deposits stay on record for audit but stop reducing any balance.
    const result = await db.run(`
      UPDATE savings_deposits
      SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = NOW(),
          cancel_reason = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL AND status = 'ACTIVE'
    `, [user.id, reason || null, user.id, id]);

    if (Number(result.rowCount || 0) === 0) {
      return NextResponse.json({ error: 'Deposit was already cancelled or does not exist' }, { status: 404 });
    }

    await logAction(db, user.id, 'cancel', 'savings_deposit', id, reason || 'Cancelled');
    return NextResponse.json({ message: 'Savings deposit cancelled' });
  } catch (error) {
    console.error('Savings deposit cancel failed:', error);
    const mapped = mapApiError(error, 'Failed to cancel savings deposit');
    return NextResponse.json(
      { success: false, code: mapped.code, error: mapped.message },
      { status: mapped.status === 500 ? 400 : mapped.status }
    );
  }
}
