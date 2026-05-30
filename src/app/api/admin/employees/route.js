import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { APP_ROLES, normalizeRole } from '@/constants/roles';

function validateStaff(data, editing = false) {
  if (!cleanText(data.username)) return 'Username is required';
  if (!cleanText(data.full_name)) return 'Staff name is required';
  if (!APP_ROLES.includes(normalizeRole(data.salon_role || data.role))) return 'Valid role is required';
  if (!editing && String(data.password || '').length < 4) return 'Password must be at least 4 characters';
  if (Number(data.commission_percentage || 0) < 0 || Number(data.commission_percentage || 0) > 100) return 'Commission must be between 0 and 100';
  if (Number(data.base_salary || 0) < 0) return 'Base salary cannot be negative';
  return null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireRole(request, db, 'admin');

    const employees = db.prepare(`
      SELECT u.id, u.username, COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name, u.role, u.email, u.phone, u.is_active, u.created_at,
             COALESCE(sp.salon_role, u.role) as salon_role,
             COALESCE(sp.assigned_services, '') as assigned_services,
             COALESCE(sp.commission_percentage, 0) as commission_percentage,
             COALESCE(sp.base_salary, 0) as base_salary,
             COALESCE(SUM(CASE WHEN sbi.item_type = 'service' THEN sbi.subtotal ELSE 0 END), 0) as service_revenue,
             COALESCE(SUM(sbi.commission_amount), 0) as commission_earned,
             COUNT(DISTINCT sbi.bill_id) as invoice_count
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      LEFT JOIN salon_bill_items sbi ON sbi.staff_id = u.id
      GROUP BY u.id
      ORDER BY u.is_active DESC, u.full_name ASC
    `).all();

    return NextResponse.json({ employees });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch staff' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, 'admin');
    const data = await request.json();
    const validationError = validateStaff(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanText(data.username));
    if (existing) return NextResponse.json({ error: 'Username already exists' }, { status: 400 });

    const role = normalizeRole(data.salon_role || data.role);
    const hashedPassword = bcrypt.hashSync(String(data.password), 10);
    const result = db.prepare(`
      INSERT INTO users (username, full_name, role, password_hash, email, phone, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanText(data.username),
      cleanText(data.full_name),
      role,
      hashedPassword,
      cleanText(data.email, null),
      cleanText(data.phone, null),
      data.is_active === false ? 0 : 1
    );

    db.prepare(`
      INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      result.lastInsertRowid,
      cleanText(data.full_name),
      role,
      Array.isArray(data.assigned_services) ? data.assigned_services.join(',') : cleanText(data.assigned_services),
      Number(data.commission_percentage || 0),
      Number(data.base_salary || 0)
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'create', 'staff', result.lastInsertRowid, cleanText(data.full_name));

    const employee = db.prepare('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ employee, message: 'Staff member created successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create staff member' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, 'admin');
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });
    const validationError = validateStaff(data, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanText(data.username), data.id);
    if (existing) return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    const role = normalizeRole(data.salon_role || data.role);

    const params = [
      cleanText(data.username),
      cleanText(data.full_name),
      role,
      cleanText(data.email, null),
      cleanText(data.phone, null),
      data.is_active ? 1 : 0
    ];
    let sql = 'UPDATE users SET username = ?, full_name = ?, role = ?, email = ?, phone = ?, is_active = ?';
    const newPassword = data.password;
    if (newPassword) {
      if (String(newPassword).length < 4) return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
      sql += ', password_hash = ?';
      params.push(bcrypt.hashSync(String(newPassword), 10));
    }
    sql += ' WHERE id = ?';
    params.push(data.id);
    db.prepare(sql).run(...params);

    db.prepare(`
      INSERT INTO staff_profiles (user_id, display_name, salon_role, assigned_services, commission_percentage, base_salary)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        display_name = excluded.display_name,
        salon_role = excluded.salon_role,
        assigned_services = excluded.assigned_services,
        commission_percentage = excluded.commission_percentage,
        base_salary = excluded.base_salary,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      data.id,
      cleanText(data.full_name),
      role,
      Array.isArray(data.assigned_services) ? data.assigned_services.join(',') : cleanText(data.assigned_services),
      Number(data.commission_percentage || 0),
      Number(data.base_salary || 0)
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'update', 'staff', data.id, cleanText(data.full_name));

    const employee = db.prepare('SELECT id, username, full_name, role, email, phone, is_active FROM users WHERE id = ?').get(data.id);
    return NextResponse.json({ employee, message: 'Staff member updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update staff member' }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'deactivate', 'staff', id, 'Staff set inactive');
    return NextResponse.json({ message: 'Staff member deactivated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to deactivate staff member' }, { status: error.status || 500 });
  }
}
