import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireAuth } from '@/lib/salon-schema';

const SERVICE_CATEGORIES = ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'];

function validateService(data) {
  const name = cleanText(data.name);
  const category = cleanText(data.category);
  const price = Number(data.price);
  const duration = Number(data.duration_minutes || data.duration);

  if (!name) return 'Service name is required';
  if (!SERVICE_CATEGORIES.includes(category)) return 'Valid service category is required';
  if (!Number.isFinite(price) || price < 0) return 'Price must be zero or greater';
  if (!Number.isInteger(duration) || duration <= 0) return 'Duration must be a positive whole number';
  return null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireAuth(request, db);

    const { searchParams } = new URL(request.url);
    const search = cleanText(searchParams.get('search'));
    const category = cleanText(searchParams.get('category'));

    const params = [];
    let where = 'WHERE 1=1';
    if (search) {
      where += ' AND (s.name LIKE ? OR s.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category && category !== 'all') {
      where += ' AND s.category = ?';
      params.push(category);
    }

    const services = db.prepare(`
      SELECT s.*, COALESCE(GROUP_CONCAT(u.full_name, ', '), '') as assigned_staff_names
      FROM salon_services s
      LEFT JOIN users u ON instr(',' || COALESCE(s.assigned_staff_ids, '') || ',', ',' || u.id || ',') > 0
      ${where}
      GROUP BY s.id
      ORDER BY s.is_active DESC, s.name ASC
    `).all(...params);

    return NextResponse.json({ services, categories: SERVICE_CATEGORIES });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch services' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const data = await request.json();
    const validationError = validateService(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const staffIds = Array.isArray(data.assigned_staff_ids) ? data.assigned_staff_ids.map(Number).filter(Boolean).join(',') : '';
    const result = db.prepare(`
      INSERT INTO salon_services (name, category, price, duration_minutes, assigned_staff_ids, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanText(data.name),
      cleanText(data.category),
      Number(data.price),
      Number(data.duration_minutes || data.duration),
      staffIds,
      cleanText(data.description, null),
      data.is_active === false ? 0 : 1
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'create', 'service', result.lastInsertRowid, cleanText(data.name));

    const service = db.prepare('SELECT * FROM salon_services WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ message: 'Service created successfully', service }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create service' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Service ID is required' }, { status: 400 });
    const validationError = validateService(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const staffIds = Array.isArray(data.assigned_staff_ids) ? data.assigned_staff_ids.map(Number).filter(Boolean).join(',') : cleanText(data.assigned_staff_ids);
    db.prepare(`
      UPDATE salon_services
      SET name = ?, category = ?, price = ?, duration_minutes = ?, assigned_staff_ids = ?,
          description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      cleanText(data.name),
      cleanText(data.category),
      Number(data.price),
      Number(data.duration_minutes || data.duration),
      staffIds,
      cleanText(data.description, null),
      data.is_active ? 1 : 0,
      data.id
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'update', 'service', data.id, cleanText(data.name));

    const service = db.prepare('SELECT * FROM salon_services WHERE id = ?').get(data.id);
    return NextResponse.json({ message: 'Service updated successfully', service });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update service' }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Service ID is required' }, { status: 400 });

    db.prepare('DELETE FROM salon_services WHERE id = ?').run(id);
    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'delete', 'service', id, 'Service deleted');
    return NextResponse.json({ message: 'Service deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete service' }, { status: error.status || 500 });
  }
}
