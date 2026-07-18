import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireAuth, requireRole } from '@/lib/salon-schema';
import { APP_ROLES, normalizeRole } from '@/constants/roles';
import { PHONE_ERROR_MESSAGE, phoneOrNull } from '@/lib/validation/phone';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';
import { publicErrorMessage } from '@/lib/api/errors';

const PRIMARY_ADMIN_USERNAME = process.env.PRIMARY_ADMIN_USERNAME || 'admin';
const LAST_ADMIN_MESSAGE = 'The last active admin account cannot be deleted. Please create another admin before deleting this account.';
const USERNAME_TAKEN_MESSAGE = 'This username is already taken. Please choose a different username.';

function normalizeUsername(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '');
}

function validateStaff(data, editing = false) {
  const username = normalizeUsername(data.username);
  if (!username) return 'Username is required';
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return 'Username must be 3–32 characters (letters, numbers, . _ - only).';
  }
  if (!cleanText(data.full_name)) return 'Staff name is required';
  if (!APP_ROLES.includes(normalizeRole(data.salon_role || data.role))) return 'Valid role is required';
  if (!editing && !/^\d{4,8}$/.test(String(data.password || ''))) return 'PIN must be 4 to 8 digits';
  if (String(data.phone || '').trim() && !phoneOrNull(data.phone)) return PHONE_ERROR_MESSAGE;
  if (Number(data.commission_percentage || 0) < 0 || Number(data.commission_percentage || 0) > 100) return 'Commission must be between 0 and 100';
  if (Number(data.base_salary || 0) < 0) return 'Base salary cannot be negative';
  return null;
}

function isDefaultAdmin(user) {
  return String(user?.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase()
    && normalizeRole(user?.role) === 'admin';
}

async function findUsernameConflict(db, username, excludeId = null) {
  if (excludeId) {
    return db.get(
      'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?) AND id != ?',
      [username, excludeId]
    );
  }
  return db.get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [username]);
}

function usernameTakenResponse() {
  return NextResponse.json(
    { success: false, error: USERNAME_TAKEN_MESSAGE, message: USERNAME_TAKEN_MESSAGE, field: 'username' },
    { status: 409 }
  );
}

function defaultAdminBlocked() {
  const message = 'The primary admin account cannot be deleted or deactivated.';
  return NextResponse.json({ success: false, message, error: message }, { status: 400 });
}

function adminRuleError(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}

function staffErrorResponse(error, fallback) {
  const message = publicErrorMessage(error, fallback);
  return NextResponse.json({ success: false, message, error: message }, { status: error.status || 500 });
}

async function ensureAdminCanChange(tx, current, nextRole, nextActive) {
  if (isDefaultAdmin(current) && (nextRole !== 'admin' || nextActive === false)) {
    throw adminRuleError('The primary admin account cannot be deleted or deactivated.');
  }
  if (normalizeRole(current?.role) !== 'admin') return;
  if (nextRole === 'admin' && nextActive !== false) return;

  const row = await tx.get(
    "SELECT COUNT(*)::int as count FROM users WHERE role = 'admin' AND is_active = TRUE AND id != ?",
    [current.id]
  );
  if (Number(row?.count || 0) <= 0) {
    throw adminRuleError(LAST_ADMIN_MESSAGE);
  }
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireAuth(request, db);

    if (!['admin', 'cashier', 'barber', 'stylist', 'beautician'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!['admin', 'cashier'].includes(user.role)) {
      const serviceStaff = await db.all(`
        SELECT u.id,
               COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name,
               u.role,
               u.is_active,
               COALESCE(sp.salon_role, u.role) as salon_role,
               COALESCE(sp.assigned_services, '') as assigned_services
        FROM users u
        LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE u.is_active = TRUE
          AND COALESCE(sp.salon_role, u.role) IN (${SERVICE_STAFF_ROLES.map(() => '?').join(',')})
        ORDER BY u.full_name ASC
      `, SERVICE_STAFF_ROLES);
      return NextResponse.json({ employees: serviceStaff });
    }

    const employees = await db.all(`
      SELECT u.id, u.username, COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name, u.role, u.email, u.phone, u.is_active, u.created_at,
             COALESCE(sp.salon_role, u.role) as salon_role,
             COALESCE(sp.assigned_services, '') as assigned_services,
             COALESCE(sp.commission_percentage, 0) as commission_percentage,
             COALESCE(sp.base_salary, 0) as base_salary,
             COALESCE(agg.service_revenue, 0) as service_revenue,
             COALESCE(agg.commission_earned, 0) as commission_earned,
             COALESCE(agg.invoice_count, 0) as invoice_count
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      LEFT JOIN (
        SELECT staff_id,
               COALESCE(SUM(CASE WHEN item_type = 'service' THEN subtotal ELSE 0 END), 0) as service_revenue,
               COALESCE(SUM(commission_amount), 0) as commission_earned,
               COUNT(DISTINCT bill_id)::int as invoice_count
        FROM salon_bill_items
        WHERE staff_id IS NOT NULL
        GROUP BY staff_id
      ) agg ON agg.staff_id = u.id
      ORDER BY u.is_active DESC, u.full_name ASC
    `);

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('GET /api/admin/employees:', error);
    return staffErrorResponse(error, 'Failed to fetch staff');
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const validationError = validateStaff(data);
    if (validationError) return NextResponse.json({ error: validationError, message: validationError }, { status: 400 });

    const username = normalizeUsername(data.username);
    const existing = await findUsernameConflict(db, username);
    if (existing) return usernameTakenResponse();

    const role = normalizeRole(data.salon_role || data.role);
    const normalizedPhone = phoneOrNull(data.phone);
    const hashedPassword = bcrypt.hashSync(String(data.password), 10);
    const result = await db.run(`
      INSERT INTO users (username, full_name, role, password_hash, email, phone, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      username,
      cleanText(data.full_name),
      role,
      hashedPassword,
      cleanText(data.email, null),
      normalizedPhone,
      data.is_active !== false
    ]);

    await db.run(`
      INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      result.lastInsertRowid,
      cleanText(data.full_name),
      role,
      Array.isArray(data.assigned_services) ? data.assigned_services.join(',') : cleanText(data.assigned_services),
      Number(data.commission_percentage || 0),
      Number(data.base_salary || 0)
    ]);

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'create', 'staff', result.lastInsertRowid, cleanText(data.full_name)]);

    const employee = await db.get('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?', [result.lastInsertRowid]);
    return NextResponse.json({ employee, message: 'Staff member created successfully' }, { status: 201 });
  } catch (error) {
    if (error?.code === '23505' || /unique|duplicate/i.test(String(error?.message || ''))) {
      return usernameTakenResponse();
    }
    return staffErrorResponse(error, 'Failed to create staff member');
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });
    const current = await db.get('SELECT id, username, role, is_active FROM users WHERE id = ?', [data.id]);
    if (!current) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    const protectedAdmin = isDefaultAdmin(current);
    if (
      protectedAdmin &&
      (data.is_active === false || normalizeRole(data.salon_role || data.role) !== 'admin')
    ) {
      return defaultAdminBlocked();
    }
    const validationError = validateStaff(data, true);
    if (validationError) return NextResponse.json({ error: validationError, message: validationError }, { status: 400 });

    const requestedUsername = normalizeUsername(data.username);
    const existing = await findUsernameConflict(db, requestedUsername, data.id);
    if (existing) return usernameTakenResponse();
    const role = protectedAdmin ? 'admin' : normalizeRole(data.salon_role || data.role);
    const username = protectedAdmin ? current.username : requestedUsername;
    const isActive = protectedAdmin ? true : data.is_active !== false;
    const normalizedPhone = phoneOrNull(data.phone);

    await db.transaction(async (tx) => {
      await ensureAdminCanChange(tx, current, role, isActive);
      const params = [
        username,
        cleanText(data.full_name),
        role,
        cleanText(data.email, null),
        normalizedPhone,
        isActive
      ];
      let sql = 'UPDATE users SET username = ?, full_name = ?, role = ?, email = ?, phone = ?, is_active = ?, updated_at = NOW()';
      const newPassword = data.password;
      if (newPassword) {
        if (!/^\d{4,8}$/.test(String(newPassword))) throw adminRuleError('PIN must be 4 to 8 digits');
        sql += ', password_hash = ?';
        params.push(bcrypt.hashSync(String(newPassword), 10));
      }
      sql += ' WHERE id = ?';
      params.push(data.id);
      await tx.run(sql, params);

      await tx.run(`
        INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          salon_role = EXCLUDED.salon_role,
          assigned_services = EXCLUDED.assigned_services,
          commission_percentage = EXCLUDED.commission_percentage,
          base_salary = EXCLUDED.base_salary,
          updated_at = NOW()
      `, [
        data.id,
        cleanText(data.full_name),
        role,
        Array.isArray(data.assigned_services) ? data.assigned_services.join(',') : cleanText(data.assigned_services),
        Number(data.commission_percentage || 0),
        Number(data.base_salary || 0)
      ]);

      await tx.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [user.id, 'update', 'staff', data.id, cleanText(data.full_name)]);
    });

    const employee = await db.get('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?', [data.id]);
    return NextResponse.json({ employee, message: 'Staff member updated successfully' });
  } catch (error) {
    if (error?.code === '23505' || /unique|duplicate/i.test(String(error?.message || ''))) {
      return usernameTakenResponse();
    }
    return staffErrorResponse(error, 'Failed to update staff member');
  }
}

export async function PATCH(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const id = Number(data.id);
    if (!id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });

    const target = await db.get('SELECT id, username, role, is_active, full_name FROM users WHERE id = ?', [id]);
    if (!target) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    const nextActive = data.is_active !== false;
    await db.transaction(async (tx) => {
      await ensureAdminCanChange(tx, target, normalizeRole(target.role), nextActive);
      await tx.run('UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?', [nextActive, id]);
      await tx.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [user.id, nextActive ? 'activate' : 'deactivate', 'staff', id, nextActive ? 'Staff set active' : 'Staff set inactive']);
    });

    return NextResponse.json({
      message: `Staff member ${nextActive ? 'activated' : 'deactivated'} successfully`,
      employee: { ...target, is_active: nextActive },
    });
  } catch (error) {
    return staffErrorResponse(error, 'Failed to update staff status');
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });

    const target = await db.get('SELECT id, username, role, full_name FROM users WHERE id = ?', [id]);
    if (!target) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

    await db.transaction(async (tx) => {
      await ensureAdminCanChange(tx, target, 'deleted', false);
      const references = await tx.get(`
        SELECT
          (SELECT COUNT(*) FROM salon_bill_items WHERE staff_id = ?) +
          (SELECT COUNT(*) FROM salon_bills WHERE cashier_id = ?) +
          (SELECT COUNT(*) FROM walk_in_tokens WHERE assigned_staff_id = ? OR created_by = ? OR printed_by = ?) as count
      `, [id, id, id, id, id]);
      if (Number(references?.count || 0) > 0) {
        const error = new Error('Staff member has billing or token history. Mark inactive instead of deleting.');
        error.status = 409;
        throw error;
      }
      await tx.run('DELETE FROM staff_profiles WHERE user_id = ?', [id]);
      await tx.run('DELETE FROM users WHERE id = ?', [id]);
      await tx.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [user.id, 'delete', 'staff', id, target.full_name || target.username]);
    });
    return NextResponse.json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    return staffErrorResponse(error, 'Failed to delete staff member');
  }
}
