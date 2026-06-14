import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { BILL_DATE_EXPR } from '@/lib/db/postgres-dates';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_ROLES = ['barber', 'stylist', 'beautician'];
const TOKEN_STATUSES = ['WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tokenSelectSql() {
  return `
    SELECT t.*, s.name as service_name, s.price as service_price, s.duration_minutes,
           s.is_package, s.package_items,
           COALESCE(st.full_name, sp.display_name) as staff_name,
           sp.salon_role as staff_role,
           COALESCE(cb.full_name, '') as created_by_name,
           COALESCE(pb.full_name, '') as printed_by_name,
           b.bill_number,
           b.grand_total as bill_total
    FROM walk_in_tokens t
    JOIN salon_services s ON s.id = t.service_id
    LEFT JOIN users st ON st.id = t.assigned_staff_id
    LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
    LEFT JOIN users cb ON cb.id = t.created_by
    LEFT JOIN users pb ON pb.id = t.printed_by
    LEFT JOIN salon_bills b ON b.id = t.invoice_id
  `;
}

function estimateDuration(service) {
  const base = Number(service.duration_minutes || 20);
  const min = Math.max(5, Math.round(base * 0.75));
  const max = Math.max(min, Math.round(base * 1.15));
  return { min, max };
}

async function calculateQueue(db, staffId) {
  const staffClause = staffId ? 'AND assigned_staff_id = ?' : '';
  const params = staffId ? [today(), staffId] : [today()];
  const rows = await db.all(`
    SELECT s.duration_minutes
    FROM walk_in_tokens t
    JOIN salon_services s ON s.id = t.service_id
    WHERE t.token_date = ?::date AND t.status = 'WAITING' ${staffClause}
    ORDER BY t.created_at ASC, t.id ASC
  `, params);

  const wait = rows.reduce((sum, row) => {
    const duration = estimateDuration(row);
    return { min: sum.min + duration.min, max: sum.max + duration.max };
  }, { min: 0, max: 0 });

  return { peopleAhead: rows.length, min: wait.min, max: wait.max };
}

async function nextTokenNumber(db) {
  const row = await db.get(
    'SELECT COUNT(*)::int as count FROM walk_in_tokens WHERE token_date = ?::date',
    [today()]
  );
  return `TKN-${String(Number(row?.count || 0) + 1).padStart(3, '0')}`;
}

function mapToken(token) {
  return {
    ...token,
    is_printed: Boolean(token.is_printed),
    wait_label: `${token.estimated_wait_minutes_min || 0}-${token.estimated_wait_minutes_max || 0} min`,
    status_label: String(token.status || '').replace('_', ' '),
  };
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier', ...SERVICE_ROLES]);
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || today();
    const mode = searchParams.get('mode') || 'queue';
    const status = searchParams.get('status') || '';
    const staffId = Number(searchParams.get('staffId') || 0);

    if (mode === 'analytics') {
      await requireRole(request, db, 'admin');
      const summary = await db.get(`
        SELECT
          COUNT(*)::int as generated,
          SUM(CASE WHEN NOT COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as digitalTokens,
          SUM(CASE WHEN COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as printedTokens,
          SUM(CASE WHEN status = 'BILLED' THEN 1 ELSE 0 END)::int as billed,
          SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END)::int as waiting,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END)::int as cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END)::int as noShow
        FROM walk_in_tokens
        WHERE token_date = ?::date AND status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
      `, [date]);
      const bills = await db.get(`
        SELECT COUNT(*)::int as totalBills,
               SUM(CASE WHEN NOT COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as digitalBills,
               SUM(CASE WHEN COALESCE(is_printed, FALSE) THEN 1 ELSE 0 END)::int as printedBills,
               SUM(CASE WHEN token_id IS NULL THEN 1 ELSE 0 END)::int as directBills,
               SUM(CASE WHEN token_id IS NOT NULL THEN 1 ELSE 0 END)::int as tokenBills
        FROM salon_bills
        WHERE (${BILL_DATE_EXPR}) >= ?::date AND (${BILL_DATE_EXPR}) < (?::date + INTERVAL '1 day') AND status = 'paid'
      `, [date, date]);
      const statusRows = await db.all(`
        SELECT status, COUNT(*)::int as count
        FROM walk_in_tokens
        WHERE token_date = ?::date AND status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
        GROUP BY status
      `, [date]);
      const staffRows = await db.all(`
        SELECT COALESCE(u.full_name, sp.display_name, 'Unassigned') as staff_name,
               COALESCE(sp.salon_role, 'unassigned') as staff_role,
               COUNT(t.id)::int as tokens_handled,
               SUM(CASE WHEN t.status = 'BILLED' THEN 1 ELSE 0 END)::int as services_completed,
               COALESCE(SUM(b.grand_total), 0) as revenue_generated,
               AVG(s.duration_minutes) as average_service_duration
        FROM walk_in_tokens t
        JOIN salon_services s ON s.id = t.service_id
        LEFT JOIN users u ON u.id = t.assigned_staff_id
        LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
        LEFT JOIN salon_bills b ON b.id = t.invoice_id
        WHERE t.token_date = ?::date AND t.status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
        GROUP BY t.assigned_staff_id, u.full_name, sp.display_name, sp.salon_role
        ORDER BY tokens_handled DESC
      `, [date]);
      const warnings = [];
      if (Number(summary.waiting || 0) > 0) warnings.push(`${summary.waiting} token(s) are still waiting.`);
      if (Number(bills.directBills || 0) > 0) warnings.push(`${bills.directBills} bill(s) were created without a token.`);
      return NextResponse.json({ summary, bills, statuses: statusRows, staff: staffRows, warnings });
    }

    const clauses = ["t.token_date = ?::date", "t.status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')"];
    const params = [date];
    if (status && TOKEN_STATUSES.includes(status)) {
      clauses.push('t.status = ?');
      params.push(status);
    }
    if (staffId) {
      clauses.push('t.assigned_staff_id = ?');
      params.push(staffId);
    } else if (SERVICE_ROLES.includes(user.role)) {
      clauses.push('t.assigned_staff_id = ?');
      clauses.push("t.status = 'WAITING'");
      params.push(user.id);
    }

    const tokens = (await db.all(`
      ${tokenSelectSql()}
      WHERE ${clauses.join(' AND ')}
      ORDER BY CASE t.status
        WHEN 'WAITING' THEN 1
        WHEN 'BILLED' THEN 2
        WHEN 'CANCELLED' THEN 3
        WHEN 'NO_SHOW' THEN 4
        ELSE 5 END,
        t.created_at ASC, t.id ASC
    `, params)).map(mapToken);

    return NextResponse.json({ tokens });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch tokens' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const serviceId = Number(data.service_id || 0);
    const staffId = Number(data.assigned_staff_id || 0) || null;
    const shouldPrint = Boolean(data.should_print);
    if (!serviceId) return NextResponse.json({ error: 'Select a service or package' }, { status: 400 });

    const created = await db.transaction(async (tx) => {
      const service = await tx.get('SELECT * FROM salon_services WHERE id = ? AND is_active = TRUE', [serviceId]);
      if (!service) throw new Error('Selected service is unavailable');
      if (staffId) {
        const staff = await tx.get(`
          SELECT u.id
          FROM users u
          JOIN staff_profiles sp ON sp.user_id = u.id
          WHERE u.id = ? AND u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
        `, [staffId]);
        if (!staff) throw new Error('Assigned staff is unavailable');
      }

      let customerId = Number(data.customer_id || 0) || null;
      const customerName = cleanText(data.customer_name, null);
      const customerPhone = cleanText(data.customer_phone, null);
      if (!customerId && customerPhone) {
        const existing = await tx.get('SELECT id FROM customers WHERE phone = ?', [customerPhone]);
        if (existing) customerId = existing.id;
      }

      const queue = await calculateQueue(tx, staffId);
      const tokenNumber = await nextTokenNumber(tx);
      const result = await tx.run(`
        INSERT INTO walk_in_tokens (
          token_number, token_date, customer_id, customer_name, customer_phone,
          service_id, package_id, assigned_staff_id, people_ahead,
          estimated_wait_minutes_min, estimated_wait_minutes_max, created_by,
          is_printed, printed_at, printed_by, notes
        ) VALUES (?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tokenNumber,
        today(),
        customerId,
        customerName,
        customerPhone,
        service.id,
        service.is_package ? service.id : null,
        staffId,
        queue.peopleAhead,
        queue.min,
        queue.max,
        user.id,
        shouldPrint,
        shouldPrint ? new Date().toISOString() : null,
        shouldPrint ? user.id : null,
        cleanText(data.notes, null),
      ]);
      await logAction(tx, user.id, shouldPrint ? 'create_printed' : 'create', 'walk_in_token', result.lastInsertRowid, tokenNumber);
      return tx.get(`${tokenSelectSql()} WHERE t.id = ?`, [result.lastInsertRowid]);
    });

    return NextResponse.json({ token: mapToken(created), message: 'Token generated successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create token' }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const tokenId = Number(data.id || data.token_id || 0);
    const action = String(data.action || '').toLowerCase();
    if (!tokenId) return NextResponse.json({ error: 'Token ID is required' }, { status: 400 });

    const updated = await db.transaction(async (tx) => {
      const token = await tx.get('SELECT * FROM walk_in_tokens WHERE id = ?', [tokenId]);
      if (!token) throw new Error('Token not found');

      if (action === 'assign') {
        if (token.status !== 'WAITING') throw new Error('Only waiting tokens can be assigned');
        const assignStaffId = Number(data.assigned_staff_id || 0) || null;
        await tx.run('UPDATE walk_in_tokens SET assigned_staff_id = ?, updated_at = NOW() WHERE id = ?', [assignStaffId, tokenId]);
      } else if (action === 'print') {
        if (['CANCELLED', 'NO_SHOW'].includes(token.status)) throw new Error('Cancelled or no-show tokens cannot be printed');
        await tx.run(`
          UPDATE walk_in_tokens
          SET is_printed = TRUE,
              printed_at = COALESCE(printed_at, NOW()),
              printed_by = COALESCE(printed_by, ?),
              updated_at = NOW()
          WHERE id = ?
        `, [user.id, tokenId]);
      } else if (action === 'cancel') {
        if (token.status !== 'WAITING') throw new Error('Only waiting tokens can be cancelled');
        await tx.run("UPDATE walk_in_tokens SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?", [tokenId]);
      } else if (action === 'no_show') {
        if (token.status !== 'WAITING') throw new Error('Only waiting tokens can be marked no-show');
        await tx.run("UPDATE walk_in_tokens SET status = 'NO_SHOW', no_show_at = NOW(), updated_at = NOW() WHERE id = ?", [tokenId]);
      } else {
        throw new Error('Unsupported token action');
      }

      await logAction(tx, user.id, action, 'walk_in_token', tokenId, token.token_number);
      return tx.get(`${tokenSelectSql()} WHERE t.id = ?`, [tokenId]);
    });

    return NextResponse.json({ token: mapToken(updated), message: 'Token updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update token' }, { status: error.status || 400 });
  }
}
