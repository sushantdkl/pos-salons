import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requireRoleWithPermission } from '@/lib/auth/permissions';
import { logAction } from '@/lib/db/helpers';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { normalizePhone as normalizeCustomerPhone } from '@/lib/validation/phone';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';
import { requireOpenSession } from '@/lib/business-day/service';
import { createWalkInToken, mapToken, tokenDate, tokenSelectSql } from '@/lib/tokens/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_ROLES = SERVICE_STAFF_ROLES;
const TOKEN_STATUSES = ['WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW'];

async function customerLookup(db, phone) {
  const customerPhone = normalizeCustomerPhone(phone);
  if (!customerPhone) return null;
  return db.get(`
    SELECT c.*,
           MAX(COALESCE(b.transaction_time, b.created_at)) as last_visit
    FROM customers c
    LEFT JOIN salon_bills b ON b.customer_id = c.id AND b.status = 'paid'
    WHERE c.phone = ?
    GROUP BY c.id
  `, [customerPhone]);
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier', ...SERVICE_ROLES]);
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || tokenDate();
    const mode = searchParams.get('mode') || 'queue';
    const status = searchParams.get('status') || '';
    const staffId = Number(searchParams.get('staffId') || 0);

    if (mode === 'customer_lookup') {
      await requireRole(request, db, ['admin', 'cashier']);
      const customer = await customerLookup(db, searchParams.get('phone'));
      return NextResponse.json({
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          totalVisits: Number(customer.total_visits || 0),
          totalSpending: Number(customer.total_spent || 0),
          lastVisit: customer.last_visit || null,
        } : null,
      });
    }

    if (mode === 'customer_search') {
      await requireRole(request, db, ['admin', 'cashier']);
      const query = cleanText(searchParams.get('q'), '');
      if (query.length < 2) return NextResponse.json({ customers: [] });
      const normalizedPhone = normalizeCustomerPhone(query);
      const digits = query.replace(/\D/g, '');
      const clauses = ['c.name ILIKE ?'];
      const params = [`%${query}%`];
      if (digits.length >= 3) {
        clauses.push('c.phone ILIKE ?');
        params.push(`%${digits}%`);
      }
      if (normalizedPhone) {
        clauses.push('c.phone = ?');
        params.push(normalizedPhone);
      }
      const customers = await db.all(`
        SELECT c.id, c.name, c.phone, c.total_visits, c.total_spent,
               MAX(COALESCE(b.transaction_time, b.created_at)) as last_visit
        FROM customers c
        LEFT JOIN salon_bills b ON b.customer_id = c.id AND b.status = 'paid'
        WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
        GROUP BY c.id, c.name, c.phone, c.total_visits, c.total_spent
        ORDER BY MAX(c.updated_at) DESC, c.name ASC
        LIMIT 8
      `, params);
      return NextResponse.json({
        customers: customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          totalVisits: Number(customer.total_visits || 0),
          totalSpending: Number(customer.total_spent || 0),
          lastVisit: customer.last_visit || null,
        })),
      });
    }

    if (mode === 'analytics') {
      await requireRole(request, db, 'admin');
      const summary = await db.get(`
        SELECT
          COUNT(*)::int as generated,
          SUM(CASE WHEN NOT COALESCE(wt.is_printed, FALSE) THEN 1 ELSE 0 END)::int as "digitalTokens",
          SUM(CASE WHEN COALESCE(wt.is_printed, FALSE) THEN 1 ELSE 0 END)::int as "printedTokens",
          SUM(CASE WHEN wt.status = 'WAITING' THEN 1 ELSE 0 END)::int as waiting,
          SUM(CASE WHEN wt.status = 'CANCELLED' THEN 1 ELSE 0 END)::int as cancelled,
          SUM(CASE WHEN wt.status = 'NO_SHOW' THEN 1 ELSE 0 END)::int as "noShow"
        FROM walk_in_tokens wt
        WHERE wt.token_date = ?::date AND wt.status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
      `, [date]);
      const converted = await db.get(`
        SELECT COUNT(DISTINCT wt.id)::int as billed
        FROM walk_in_tokens wt
        JOIN salon_bills sb
          ON sb.id = wt.invoice_id
         AND sb.token_id = wt.id
         AND sb.status = 'paid'
        WHERE wt.status = 'BILLED'
          AND wt.invoice_id IS NOT NULL
          AND ((COALESCE(wt.billed_at, sb.transaction_time, sb.created_at)) AT TIME ZONE 'Asia/Kathmandu')::date = ?::date
      `, [date]);
      const bills = await db.get(`
        SELECT COUNT(DISTINCT sb.id)::int as "tokenBills",
               COUNT(DISTINCT CASE WHEN NOT COALESCE(sb.is_printed, FALSE) THEN sb.id END)::int as "digitalBills",
               COUNT(DISTINCT CASE WHEN COALESCE(sb.is_printed, FALSE) THEN sb.id END)::int as "printedBills"
        FROM walk_in_tokens wt
        JOIN salon_bills sb
          ON sb.id = wt.invoice_id
         AND sb.token_id = wt.id
         AND sb.status = 'paid'
        WHERE wt.token_date = ?::date
          AND wt.status = 'BILLED'
          AND wt.invoice_id IS NOT NULL
      `, [date]);
      const directBills = await db.get(`
        SELECT COUNT(DISTINCT sb.id)::int as "directBills"
        FROM salon_bills sb
        WHERE sb.token_id IS NULL
          AND sb.status = 'paid'
          AND ((COALESCE(sb.transaction_time, sb.created_at)) AT TIME ZONE 'Asia/Kathmandu')::date = ?::date
      `, [date]);
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
               COUNT(DISTINCT CASE WHEN t.status = 'BILLED' AND t.invoice_id IS NOT NULL AND b.id IS NOT NULL AND b.status = 'paid' THEN t.id END)::int as services_completed,
               COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.grand_total ELSE 0 END), 0) as revenue_generated,
               AVG(s.duration_minutes) as average_service_duration
        FROM walk_in_tokens t
        JOIN salon_services s ON s.id = t.service_id
        LEFT JOIN users u ON u.id = t.assigned_staff_id
        LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
        LEFT JOIN salon_bills b ON b.id = t.invoice_id AND b.token_id = t.id
        WHERE t.token_date = ?::date AND t.status IN ('WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW')
        GROUP BY t.assigned_staff_id, u.full_name, sp.display_name, sp.salon_role
        ORDER BY tokens_handled DESC
      `, [date]);
      const warnings = [];
      if (Number(summary.waiting || 0) > 0) warnings.push(`${summary.waiting} token(s) are still waiting.`);
      const directBillCount = Number(directBills?.directbills || directBills?.directBills || 0);
      if (directBillCount > 0) warnings.push(`${directBillCount} bill(s) were created without a token.`);
      return NextResponse.json({
        summary: {
          generated: Number(summary?.generated || 0),
          digitalTokens: Number(summary?.digitaltokens || summary?.digitalTokens || 0),
          printedTokens: Number(summary?.printedtokens || summary?.printedTokens || 0),
          waiting: Number(summary?.waiting || 0),
          cancelled: Number(summary?.cancelled || 0),
          noShow: Number(summary?.noshow || summary?.noShow || 0),
          billed: Number(converted?.billed || 0),
        },
        bills: {
          totalBills: Number(bills?.tokenbills || bills?.tokenBills || 0),
          digitalBills: Number(bills?.digitalbills || bills?.digitalBills || 0),
          printedBills: Number(bills?.printedbills || bills?.printedBills || 0),
          directBills: Number(directBills?.directbills || directBills?.directBills || 0),
          tokenBills: Number(bills?.tokenbills || bills?.tokenBills || 0),
        },
        statuses: statusRows,
        staff: staffRows,
        warnings,
      });
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
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.TOKENS_MANAGE);
    const { sessionId, businessDayId } = await requireOpenSession(db);
    const data = await request.json();
    const serviceId = Number(data.service_id || 0);
    const staffId = Number(data.assigned_staff_id || 0) || null;
    const shouldPrint = Boolean(data.should_print);
    if (!serviceId) return NextResponse.json({ error: 'Select a service or package' }, { status: 400 });

    const created = await db.transaction((tx) => createWalkInToken(tx, {
      serviceId,
      staffId,
      customerId: data.customer_id,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      notes: data.notes,
      shouldPrint,
      userId: user.id,
      sessionId,
      businessDayId,
    }));

    return NextResponse.json({ token: mapToken(created), message: 'Token generated successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to create token', code: error.code },
      { status: error.status || 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRoleWithPermission(request, db, ['admin', 'cashier'], PERMISSIONS.TOKENS_MANAGE);
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
