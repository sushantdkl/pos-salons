import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { isUniqueViolation, publicErrorMessage } from '@/lib/api/errors';
import { PHONE_ERROR_MESSAGE, phoneOrNull } from '@/lib/validation/phone';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';

function validateCustomer(data) {
  if (!cleanText(data.name)) return 'Customer name is required';
  if (String(data.phone || '').trim() && !phoneOrNull(data.phone)) return PHONE_ERROR_MESSAGE;
  return null;
}

function validationErrorResponse(message, field = null) {
  return NextResponse.json({
    success: false,
    code: 'VALIDATION_ERROR',
    message,
    error: message,
    field,
  }, { status: 400 });
}

function duplicatePhoneResponse() {
  return NextResponse.json({
    success: false,
    code: 'CUSTOMER_PHONE_EXISTS',
    message: 'This phone number is already registered.',
    error: 'This phone number is already registered.',
    field: 'phone',
  }, { status: 409 });
}

async function normalizePreferredStaff(db, staffId) {
  const id = Number(staffId || 0) || null;
  if (!id) return null;
  const staff = await db.get(`
    SELECT u.id
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.is_active = TRUE AND sp.salon_role IN (${SERVICE_STAFF_ROLES.map(() => '?').join(',')})
  `, [id, ...SERVICE_STAFF_ROLES]);
  if (!staff) {
    const error = new Error('Selected preferred staff is not available.');
    error.status = 422;
    throw error;
  }
  return id;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (id) {
      const customer = await db.get(`
        SELECT c.*, u.full_name as preferred_stylist_name
        FROM customers c
        LEFT JOIN users u ON u.id = c.preferred_stylist_id
        WHERE c.id = ?
      `, [id]);
      const bills = await db.all(`
        SELECT * FROM salon_bills
        WHERE customer_id = ?
        ORDER BY created_at DESC
      `, [id]);
      return NextResponse.json({ customer, bills });
    }

    const search = cleanText(searchParams.get('search'));
    const params = [];
    let where = 'WHERE 1=1';
    if (search) {
      where += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const customers = await db.all(`
      SELECT c.*, u.full_name as preferred_stylist_name,
             CASE WHEN COALESCE(c.total_visits, 0) >= 2 THEN 1 ELSE 0 END as is_repeat
      FROM customers c
      LEFT JOIN users u ON u.id = c.preferred_stylist_id
      ${where}
      ORDER BY c.updated_at DESC, c.name ASC
    `, params);

    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, 'Failed to fetch customers'), message: publicErrorMessage(error, 'Failed to fetch customers') },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const validationError = validateCustomer(data);
    if (validationError) {
      return validationErrorResponse(
        validationError,
        validationError === PHONE_ERROR_MESSAGE ? 'phone' : null
      );
    }
    const normalizedPhone = phoneOrNull(data.phone);
    if (normalizedPhone) {
      const duplicate = await db.get('SELECT id FROM customers WHERE phone = ?', [normalizedPhone]);
      if (duplicate) return duplicatePhoneResponse();
    }
    const preferredStaffId = await normalizePreferredStaff(db, data.preferred_stylist_id);

    const result = await db.run(`
      INSERT INTO customers (
        name, phone, email, address, gender, favorite_services,
        preferred_stylist_id, notes, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cleanText(data.name),
      normalizedPhone,
      cleanText(data.email, null),
      cleanText(data.address, null),
      cleanText(data.gender, null),
      cleanText(data.favorite_services, null),
      preferredStaffId,
      cleanText(data.notes, null),
      Number(data.credit_limit || 0)
    ]);

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'create', 'customer', result.lastInsertRowid, cleanText(data.name)]);

    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);
    return NextResponse.json({ customer, message: 'Customer created successfully' }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicatePhoneResponse();
    console.error('POST /api/admin/customers:', error);
    return NextResponse.json({
      error: publicErrorMessage(error, 'Failed to create customer'),
      message: publicErrorMessage(error, 'Failed to create customer'),
    }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    const validationError = validateCustomer(data);
    if (validationError) {
      return validationErrorResponse(
        validationError,
        validationError === PHONE_ERROR_MESSAGE ? 'phone' : null
      );
    }
    const normalizedPhone = phoneOrNull(data.phone);
    const preferredStaffId = await normalizePreferredStaff(db, data.preferred_stylist_id);
    if (normalizedPhone) {
      const duplicate = await db.get('SELECT id FROM customers WHERE phone = ? AND id != ?', [normalizedPhone, data.id]);
      if (duplicate) return duplicatePhoneResponse();
    }

    await db.run(`
      UPDATE customers
      SET name = ?, phone = ?, email = ?, address = ?, gender = ?,
          favorite_services = ?, preferred_stylist_id = ?, notes = ?,
          credit_limit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      cleanText(data.name),
      normalizedPhone,
      cleanText(data.email, null),
      cleanText(data.address, null),
      cleanText(data.gender, null),
      cleanText(data.favorite_services, null),
      preferredStaffId,
      cleanText(data.notes, null),
      Number(data.credit_limit || 0),
      data.id
    ]);

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'update', 'customer', data.id, cleanText(data.name)]);

    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [data.id]);
    return NextResponse.json({ customer, message: 'Customer updated successfully' });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicatePhoneResponse();
    console.error('PUT /api/admin/customers:', error);
    return NextResponse.json({
      error: publicErrorMessage(error, 'Failed to update customer'),
      message: publicErrorMessage(error, 'Failed to update customer'),
    }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });

    await db.run('DELETE FROM customers WHERE id = ?', [id]);
    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'delete', 'customer', id, 'Customer deleted']);
    return NextResponse.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    return NextResponse.json({
      error: publicErrorMessage(error, 'Failed to delete customer'),
      message: publicErrorMessage(error, 'Failed to delete customer'),
    }, { status: error.status || 500 });
  }
}
