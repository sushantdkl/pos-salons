/**
 * Walk-in token creation — shared by the Tokens API and appointment check-in, so a token is
 * always numbered, queued and attributed to the Business Day / Store Session the same way.
 */

import { logAction } from '@/lib/db/helpers';
import { cleanText } from '@/lib/salon-schema';
import { PHONE_ERROR_MESSAGE, normalizePhone as normalizeCustomerPhone } from '@/lib/validation/phone';
import { salonDateString } from '@/lib/reports/dashboard-period';

/**
 * The Nepal calendar date. Tokens used new Date().toISOString(), a UTC date, so a token issued
 * between 00:00 and 05:45 Nepal time was dated the previous day.
 */
export function tokenDate() {
  return salonDateString();
}

export function tokenSelectSql() {
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

export async function calculateQueue(db, staffId) {
  const staffClause = staffId ? 'AND assigned_staff_id = ?' : '';
  const params = staffId ? [tokenDate(), staffId] : [tokenDate()];
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

export async function nextTokenNumber(db) {
  const row = await db.get(
    'SELECT COUNT(*)::int as count FROM walk_in_tokens WHERE token_date = ?::date',
    [tokenDate()]
  );
  return `TKN-${String(Number(row?.count || 0) + 1).padStart(3, '0')}`;
}

export function mapToken(token) {
  return {
    ...token,
    is_printed: Boolean(token.is_printed),
    wait_label: `${token.estimated_wait_minutes_min || 0}-${token.estimated_wait_minutes_max || 0} min`,
    status_label: String(token.status || '').replace('_', ' '),
  };
}

export async function findOrCreateCustomerForToken(tx, { name, phone }) {
  const customerPhone = normalizeCustomerPhone(phone);
  const customerName = cleanText(name, '');
  if (!customerPhone) return null;
  const existing = await tx.get('SELECT * FROM customers WHERE phone = ?', [customerPhone]);
  if (existing) return existing;
  const fallbackName = customerName || `Customer ${customerPhone}`;
  const result = await tx.run(
    'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
    [fallbackName, customerPhone, 'Created from walk-in token']
  );
  return tx.get('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);
}

/**
 * Create one WAITING token inside the caller's transaction. The caller has already confirmed
 * a store session is open and passes its ids.
 */
export async function createWalkInToken(tx, {
  serviceId, staffId = null, customerId = null, customerName = '', customerPhone = '',
  notes = null, shouldPrint = false, userId, sessionId, businessDayId,
}) {
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

  const enteredCustomerName = cleanText(customerName, '');
  const hasPhoneInput = String(customerPhone || '').trim();
  const phone = hasPhoneInput ? normalizeCustomerPhone(customerPhone) : null;
  if (hasPhoneInput && !phone) throw new Error(PHONE_ERROR_MESSAGE);
  let tokenCustomer = null;
  let resolvedCustomerId = Number(customerId || 0) || null;
  if (!resolvedCustomerId) {
    tokenCustomer = await findOrCreateCustomerForToken(tx, { name: enteredCustomerName, phone });
    resolvedCustomerId = tokenCustomer?.id || null;
  } else {
    tokenCustomer = await tx.get('SELECT * FROM customers WHERE id = ?', [resolvedCustomerId]);
  }
  const resolvedName = enteredCustomerName || tokenCustomer?.name || null;

  const queue = await calculateQueue(tx, staffId);
  const tokenNumber = await nextTokenNumber(tx);
  const result = await tx.run(`
    INSERT INTO walk_in_tokens (
      token_number, token_date, customer_id, customer_name, customer_phone,
      service_id, package_id, assigned_staff_id, people_ahead,
      estimated_wait_minutes_min, estimated_wait_minutes_max, created_by,
      is_printed, printed_at, printed_by, notes, business_day_id, store_session_id
    ) VALUES (?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    tokenNumber, tokenDate(), resolvedCustomerId, resolvedName, phone,
    service.id, service.is_package ? service.id : null, staffId,
    queue.peopleAhead, queue.min, queue.max, userId,
    shouldPrint, shouldPrint ? new Date().toISOString() : null, shouldPrint ? userId : null,
    cleanText(notes, null), businessDayId, sessionId,
  ]);
  await logAction(tx, userId, shouldPrint ? 'create_printed' : 'create', 'walk_in_token', result.lastInsertRowid, tokenNumber);
  return tx.get(`${tokenSelectSql()} WHERE t.id = ?`, [result.lastInsertRowid]);
}
