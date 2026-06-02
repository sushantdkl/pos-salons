import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = ['WAITING', 'CALLED', 'IN_SERVICE'];
const SERVICE_ROLES = ['barber', 'stylist', 'beautician'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tokenSelectSql() {
  return `
    SELECT t.*, s.name as service_name, s.price as service_price, s.duration_minutes,
           s.is_package, s.package_items,
           COALESCE(st.full_name, sp.display_name) as staff_name,
           sp.salon_role as staff_role,
           b.bill_number,
           b.grand_total as bill_total
    FROM walk_in_tokens t
    JOIN salon_services s ON s.id = t.service_id
    LEFT JOIN users st ON st.id = t.assigned_staff_id
    LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
    LEFT JOIN salon_bills b ON b.id = t.invoice_id
  `;
}

function estimateDuration(service) {
  const base = Number(service.duration_minutes || 20);
  const min = Math.max(5, Math.round(base * 0.75));
  const max = Math.max(min, Math.round(base * 1.15));
  return { min, max };
}

function calculateQueue(db, service, staffId) {
  const staffClause = staffId ? 'AND assigned_staff_id = ?' : '';
  const params = staffId ? [today(), staffId] : [today()];
  const rows = db.prepare(`
    SELECT t.status, s.duration_minutes
    FROM walk_in_tokens t
    JOIN salon_services s ON s.id = t.service_id
    WHERE t.token_date = ? AND t.status IN ('WAITING', 'CALLED', 'IN_SERVICE') ${staffClause}
    ORDER BY t.created_at ASC, t.id ASC
  `).all(...params);

  const peopleAhead = rows.length;
  const wait = rows.reduce((sum, row) => {
    const duration = estimateDuration(row);
    const multiplier = row.status === 'IN_SERVICE' ? 0.5 : 1;
    return {
      min: sum.min + Math.round(duration.min * multiplier),
      max: sum.max + Math.round(duration.max * multiplier),
    };
  }, { min: 0, max: 0 });
  return { peopleAhead, min: wait.min, max: wait.max };
}

function nextTokenNumber(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM walk_in_tokens WHERE token_date = ?').get(today()).count;
  return `TKN-${String(count + 1).padStart(3, '0')}`;
}

function mapToken(token) {
  return {
    ...token,
    wait_label: `${token.estimated_wait_minutes_min || 0}-${token.estimated_wait_minutes_max || 0} min`,
    status_label: String(token.status || '').replace('_', ' '),
  };
}

function canReadTokens(role) {
  return ['admin', 'cashier', ...SERVICE_ROLES].includes(role);
}

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, ['admin', 'cashier', ...SERVICE_ROLES]);
    if (!canReadTokens(user.role)) throw new Error('Access denied');

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || today();
    const mode = searchParams.get('mode') || 'queue';
    const status = searchParams.get('status') || '';
    const staffId = Number(searchParams.get('staffId') || 0);

    if (mode === 'analytics') {
      requireRole(request, db, 'admin');
      const summary = db.prepare(`
        SELECT
          COUNT(*) as generated,
          SUM(CASE WHEN status = 'BILLED' THEN 1 ELSE 0 END) as billed,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) as noShow,
          SUM(CASE WHEN status IN ('WAITING', 'CALLED') THEN 1 ELSE 0 END) as waiting,
          SUM(CASE WHEN status = 'IN_SERVICE' THEN 1 ELSE 0 END) as inService
        FROM walk_in_tokens
        WHERE token_date = ?
      `).get(date);
      const bills = db.prepare(`
        SELECT COUNT(*) as printed,
               SUM(CASE WHEN token_id IS NULL THEN 1 ELSE 0 END) as directBills,
               SUM(CASE WHEN token_id IS NOT NULL THEN 1 ELSE 0 END) as tokenBills
        FROM salon_bills
        WHERE DATE(created_at) = DATE(?) AND status = 'paid'
      `).get(date);
      const statusRows = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM walk_in_tokens
        WHERE token_date = ?
        GROUP BY status
      `).all(date);
      const staffRows = db.prepare(`
        SELECT COALESCE(u.full_name, sp.display_name, 'Unassigned') as staff_name,
               COALESCE(sp.salon_role, 'unassigned') as staff_role,
               COUNT(t.id) as tokens_handled,
               SUM(CASE WHEN t.status IN ('COMPLETED', 'BILLED') THEN 1 ELSE 0 END) as services_completed,
               COALESCE(SUM(b.grand_total), 0) as revenue_generated,
               AVG(CASE WHEN t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
                 THEN (julianday(t.completed_at) - julianday(t.started_at)) * 24 * 60
                 ELSE NULL END) as average_service_duration
        FROM walk_in_tokens t
        LEFT JOIN users u ON u.id = t.assigned_staff_id
        LEFT JOIN staff_profiles sp ON sp.user_id = t.assigned_staff_id
        LEFT JOIN salon_bills b ON b.id = t.invoice_id
        WHERE t.token_date = ?
        GROUP BY t.assigned_staff_id
        ORDER BY tokens_handled DESC
      `).all(date);
      const warnings = [];
      if (Number(summary.completed || 0) > 0) warnings.push('Service completed but billing not done.');
      if (Number(bills.directBills || 0) > 0) warnings.push(`${bills.directBills} bill(s) were created without a token.`);
      return NextResponse.json({ summary, bills, statuses: statusRows, staff: staffRows, warnings });
    }

    const clauses = ['t.token_date = ?'];
    const params = [date];
    if (status) {
      clauses.push('t.status = ?');
      params.push(status);
    }
    if (staffId) {
      clauses.push('t.assigned_staff_id = ?');
      params.push(staffId);
    } else if (SERVICE_ROLES.includes(user.role)) {
      clauses.push('t.assigned_staff_id = ?');
      params.push(user.id);
    }

    const tokens = db.prepare(`
      ${tokenSelectSql()}
      WHERE ${clauses.join(' AND ')}
      ORDER BY CASE t.status
        WHEN 'IN_SERVICE' THEN 1
        WHEN 'CALLED' THEN 2
        WHEN 'WAITING' THEN 3
        WHEN 'COMPLETED' THEN 4
        WHEN 'BILLED' THEN 5
        ELSE 6 END,
        t.created_at ASC, t.id ASC
    `).all(...params).map(mapToken);

    return NextResponse.json({ tokens });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch tokens' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const serviceId = Number(data.service_id || 0);
    const staffId = Number(data.assigned_staff_id || 0) || null;
    if (!serviceId) return NextResponse.json({ error: 'Select a service or package' }, { status: 400 });

    const created = db.transaction(() => {
      const service = db.prepare('SELECT * FROM salon_services WHERE id = ? AND is_active = 1').get(serviceId);
      if (!service) throw new Error('Selected service is unavailable');
      if (staffId) {
        const staff = db.prepare(`
          SELECT u.id
          FROM users u
          JOIN staff_profiles sp ON sp.user_id = u.id
          WHERE u.id = ? AND u.is_active = 1 AND sp.salon_role IN ('barber', 'stylist', 'beautician')
        `).get(staffId);
        if (!staff) throw new Error('Assigned staff is unavailable');
      }

      let customerId = Number(data.customer_id || 0) || null;
      const customerName = cleanText(data.customer_name, null);
      const customerPhone = cleanText(data.customer_phone, null);
      if (!customerId && customerPhone) {
        const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(customerPhone);
        if (existing) customerId = existing.id;
      }

      const queue = calculateQueue(db, service, staffId);
      const tokenNumber = nextTokenNumber(db);
      const result = db.prepare(`
        INSERT INTO walk_in_tokens (
          token_number, token_date, customer_id, customer_name, customer_phone,
          service_id, package_id, assigned_staff_id, people_ahead,
          estimated_wait_minutes_min, estimated_wait_minutes_max, created_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        cleanText(data.notes, null)
      );
      db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, 'create', 'walk_in_token', result.lastInsertRowid, tokenNumber);
      return db.prepare(`${tokenSelectSql()} WHERE t.id = ?`).get(result.lastInsertRowid);
    })();

    return NextResponse.json({ token: mapToken(created), message: 'Token generated successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create token' }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, ['admin', 'cashier', ...SERVICE_ROLES]);
    const data = await request.json();
    const tokenId = Number(data.id || data.token_id || 0);
    const action = String(data.action || '').toLowerCase();
    if (!tokenId) return NextResponse.json({ error: 'Token ID is required' }, { status: 400 });

    const updated = db.transaction(() => {
      const token = db.prepare('SELECT * FROM walk_in_tokens WHERE id = ?').get(tokenId);
      if (!token) throw new Error('Token not found');
      if (SERVICE_ROLES.includes(user.role) && token.assigned_staff_id !== user.id) throw new Error('Access denied');

      if (action === 'assign') {
        requireRole(request, db, ['admin', 'cashier']);
        const staffId = Number(data.assigned_staff_id || 0) || null;
        db.prepare('UPDATE walk_in_tokens SET assigned_staff_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(staffId, tokenId);
      } else if (action === 'call') {
        if (!['WAITING'].includes(token.status)) throw new Error('Only waiting tokens can be called');
        db.prepare("UPDATE walk_in_tokens SET status = 'CALLED', called_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenId);
      } else if (action === 'start') {
        if (!['WAITING', 'CALLED'].includes(token.status)) throw new Error('Only waiting or called tokens can be started');
        if (!token.assigned_staff_id) throw new Error('Assign staff before starting service');
        db.prepare("UPDATE walk_in_tokens SET status = 'IN_SERVICE', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenId);
      } else if (action === 'complete') {
        if (token.status !== 'IN_SERVICE') throw new Error('Token cannot be completed before service starts');
        db.prepare("UPDATE walk_in_tokens SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenId);
      } else if (action === 'cancel') {
        requireRole(request, db, ['admin', 'cashier']);
        if (['BILLED'].includes(token.status)) throw new Error('Billed token cannot be cancelled');
        db.prepare("UPDATE walk_in_tokens SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenId);
      } else if (action === 'no_show') {
        requireRole(request, db, ['admin', 'cashier']);
        if (['BILLED'].includes(token.status)) throw new Error('Billed token cannot be marked no-show');
        db.prepare("UPDATE walk_in_tokens SET status = 'NO_SHOW', no_show_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenId);
      } else {
        throw new Error('Unsupported token action');
      }

      db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, action, 'walk_in_token', tokenId, token.token_number);
      return db.prepare(`${tokenSelectSql()} WHERE t.id = ?`).get(tokenId);
    })();

    return NextResponse.json({ token: mapToken(updated), message: 'Token updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update token' }, { status: error.status || 400 });
  }
}
