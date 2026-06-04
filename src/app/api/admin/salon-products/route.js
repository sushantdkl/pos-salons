import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

function validateProduct(data) {
  if (!cleanText(data.name)) return 'Product name is required';
  if (!cleanText(data.category)) return 'Category is required';
  if (!Number.isFinite(Number(data.purchase_price)) || Number(data.purchase_price) < 0) return 'Purchase price must be zero or greater';
  if (!Number.isFinite(Number(data.selling_price)) || Number(data.selling_price) < 0) return 'Selling price must be zero or greater';
  if (!Number.isInteger(Number(data.current_stock)) || Number(data.current_stock) < 0) return 'Current stock cannot be negative';
  if (!Number.isInteger(Number(data.low_stock_threshold)) || Number(data.low_stock_threshold) < 0) return 'Low stock threshold cannot be negative';
  return null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);

    const { searchParams } = new URL(request.url);
    const search = cleanText(searchParams.get('search'));
    const category = cleanText(searchParams.get('category'));
    const params = [];
    let where = 'WHERE 1=1';
    if (search) {
      where += ' AND (name LIKE ? OR category LIKE ? OR supplier LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category && category !== 'all') {
      where += ' AND category = ?';
      params.push(category);
    }

    const products = await db.all(`
      SELECT *, current_stock <= low_stock_threshold as is_low_stock,
             current_stock * purchase_price as stock_value
      FROM salon_products
      ${where}
      ORDER BY status DESC, name ASC
    `, params);

    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch products' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const validationError = validateProduct(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const result = await db.run(`
      INSERT INTO salon_products (
        name, category, purchase_price, selling_price, current_stock,
        low_stock_threshold, supplier, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cleanText(data.name),
      cleanText(data.category),
      Number(data.purchase_price),
      Number(data.selling_price),
      Number(data.current_stock),
      Number(data.low_stock_threshold),
      cleanText(data.supplier, null),
      data.expiry_date || null,
      data.status === 'inactive' ? 'inactive' : 'active'
    ]);

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'create', 'product', result.lastInsertRowid, cleanText(data.name)]);

    const product = await db.get('SELECT * FROM salon_products WHERE id = ?', [result.lastInsertRowid]);
    return NextResponse.json({ product, message: 'Product created successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create product' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    if (!data.id) return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });

    if (data.movement_type) {
      const quantity = Number(data.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ error: 'Movement quantity must be positive' }, { status: 400 });
      const product = await db.get('SELECT * FROM salon_products WHERE id = ?', [data.id]);
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      const isOut = ['stock_out', 'sale'].includes(data.movement_type);
      const newStock = isOut ? product.current_stock - quantity : product.current_stock + quantity;
      if (newStock < 0) return NextResponse.json({ error: 'Stock cannot go negative' }, { status: 400 });

      await db.run('UPDATE salon_products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStock, data.id]);
      await db.run(`
        INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [data.id, data.movement_type, quantity, product.current_stock, newStock, cleanText(data.notes, null)]);

      const updated = await db.get('SELECT * FROM salon_products WHERE id = ?', [data.id]);
      return NextResponse.json({ product: updated, message: 'Stock updated successfully' });
    }

    const validationError = validateProduct(data);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    await db.run(`
      UPDATE salon_products
      SET name = ?, category = ?, purchase_price = ?, selling_price = ?, current_stock = ?,
          low_stock_threshold = ?, supplier = ?, expiry_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      cleanText(data.name),
      cleanText(data.category),
      Number(data.purchase_price),
      Number(data.selling_price),
      Number(data.current_stock),
      Number(data.low_stock_threshold),
      cleanText(data.supplier, null),
      data.expiry_date || null,
      data.status === 'inactive' ? 'inactive' : 'active',
      data.id
    ]);

    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'update', 'product', data.id, cleanText(data.name)]);
    const product = await db.get('SELECT * FROM salon_products WHERE id = ?', [data.id]);
    return NextResponse.json({ product, message: 'Product updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update product' }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });

    await db.run('DELETE FROM salon_products WHERE id = ?', [id]);
    await db.run('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'delete', 'product', id, 'Product deleted']);
    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete product' }, { status: error.status || 500 });
  }
}
