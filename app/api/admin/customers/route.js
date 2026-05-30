import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireAuth } from '@/lib/salon-schema';

function validateCustomer(data) {
  if (!cleanText(data.name)) return 'Customer name is required';
  if (data.phone && !/^[0-9+\-\s()]{6,20}$/.test(String(data.phone))) return 'Phone number is invalid';
  return null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireAuth(request, db);

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (id) {
      const customer = db.prepare(`
        SELECT c.*, u.full_name as preferred_stylist_name
        FROM customers c
        LEFT JOIN users u ON u.id = c.preferred_stylist_id
        WHERE c.id = ?
      `).get(id);
      const bills = db.prepare(`
        SELECT * FROM salon_bills
        WHERE customer_id = ?
        ORDER BY created_at DESC
      `).all(id);
      return NextResponse.json({ customer, bills });
    }

    const search = cleanText(searchParams.get('search'));
    const params = [];
    let where = 'WHERE 1=1';
    if (search) {
      where += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const customers = db.prepare(`
      SELECT c.*, u.full_name as preferred_stylist_name,
             CASE WHEN COALESCE(c.total_visits, 0) >= 2 THEN 1 ELSE 0 END as is_repeat
      FROM customers c
      LEFT JOIN users u ON u.id = c.preferred_stylist_id
      ${where}
      ORDER BY c.updated_at DESC, c.name ASC
    `).all(...params);

    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch customers' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const data = await request.json();
    const validationError = validateCustomer(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const result = db.prepare(`
      INSERT INTO customers (
        name, phone, email, address, gender, favorite_services,
        preferred_stylist_id, notes, credit_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanText(data.name),
      cleanText(data.phone, null),
      cleanText(data.email, null),
      cleanText(data.address, null),
      cleanText(data.gender, null),
      cleanText(data.favorite_services, null),
      data.preferred_stylist_id || null,
      cleanText(data.notes, null),
      Number(data.credit_limit || 0)
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'create', 'customer', result.lastInsertRowid, cleanText(data.name));

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ customer, message: 'Customer created successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create customer' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    const validationError = validateCustomer(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, email = ?, address = ?, gender = ?,
          favorite_services = ?, preferred_stylist_id = ?, notes = ?,
          credit_limit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      cleanText(data.name),
      cleanText(data.phone, null),
      cleanText(data.email, null),
      cleanText(data.address, null),
      cleanText(data.gender, null),
      cleanText(data.favorite_services, null),
      data.preferred_stylist_id || null,
      cleanText(data.notes, null),
      Number(data.credit_limit || 0),
      data.id
    );

    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'update', 'customer', data.id, cleanText(data.name));

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(data.id);
    return NextResponse.json({ customer, message: 'Customer updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update customer' }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireAuth(request, db);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });

    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, 'delete', 'customer', id, 'Customer deleted');
    return NextResponse.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete customer' }, { status: error.status || 500 });
  }
}
