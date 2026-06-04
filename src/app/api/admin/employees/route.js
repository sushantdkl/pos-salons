import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { APP_ROLES, normalizeRole } from '@/constants/roles';

function validateStaff(data, editing = false) {
  if (!cleanText(data.username)) return 'Username is required';
  if (!cleanText(data.full_name)) return 'Staff name is required';
  if (!APP_ROLES.includes(normalizeRole(data.salon_role || data.role))) return 'Valid role is required';
  if (!editing && !/^\d{4,8}$/.test(String(data.password || ''))) return 'PIN must be 4 to 8 digits';
  if (Number(data.commission_percentage || 0) < 0 || Number(data.commission_percentage || 0) > 100) return 'Commission must be between 0 and 100';
  if (Number(data.base_salary || 0) < 0) return 'Base salary cannot be negative';
  return null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);

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
    return NextResponse.json({ error: error.message || 'Failed to fetch staff' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    const validationError = validateStaff(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [cleanText(data.username)]);
    if (existing) return NextResponse.json({ error: 'Username already exists' }, { status: 400 });

    const role = normalizeRole(data.salon_role || data.role);
    const hashedPassword = bcrypt.hashSync(String(data.password), 10);
    const result = await db.run(`
      INSERT INTO users (username, full_name, role, password_hash, email, phone, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      cleanText(data.username),
      cleanText(data.full_name),
      role,
      hashedPassword,
      cleanText(data.email, null),
      cleanText(data.phone, null),
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
    return NextResponse.json({ error: error.message || 'Failed to create staff member' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, 'admin');
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });
    const validationError = validateStaff(data, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [cleanText(data.username), data.id]);
    if (existing) return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    const role = normalizeRole(data.salon_role || data.role);

    const params = [
      cleanText(data.username),
      cleanText(data.full_name),
      role,
      cleanText(data.email, null),
      cleanText(data.phone, null),
      data.is_active !== false
    ];
    let sql = 'UPDATE users SET username = ?, full_name = ?, role = ?, email = ?, phone = ?, is_active = ?, updated_at = NOW()';
    const newPassword = data.password;
    if (newPassword) {
      if (!/^\d{4,8}$/.test(String(newPassword))) return NextResponse.json({ error: 'PIN must be 4 to 8 digits' }, { status: 400 });
      sql += ', password_hash = ?';
      params.push(bcrypt.hashSync(String(newPassword), 10));
    }
    sql += ' WHERE id = ?';
    params.push(data.id);
    await db.run(sql, params);

    await db.run(`
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

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'update', 'staff', data.id, cleanText(data.full_name)]);

    const employee = await db.get('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?', [data.id]);
    return NextResponse.json({ employee, message: 'Staff member updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update staff member' }, { status: error.status || 500 });
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
    await db.run('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ?', [id]);
    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'deactivate', 'staff', id, 'Staff set inactive']);
    return NextResponse.json({ message: 'Staff member deactivated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to deactivate staff member' }, { status: error.status || 500 });
  }
}
