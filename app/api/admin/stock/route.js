import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    // Create stock table if it doesn't exist
    db.prepare(`
      CREATE TABLE IF NOT EXISTS stock_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        cost_per_unit REAL NOT NULL,
        supplier TEXT,
        purchase_date TEXT,
        expiry_date TEXT,
        min_stock_level REAL DEFAULT 10,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    const stocks = db.prepare(`
      SELECT * FROM stock_items
      ORDER BY created_at DESC
    `).all();

    return NextResponse.json({ stocks });
  } catch (error) {
    console.error('Get stock error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    const result = db.prepare(`
      INSERT INTO stock_items (
        item_name, category, quantity, unit, cost_per_unit,
        supplier, purchase_date, expiry_date, min_stock_level, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.item_name,
      data.category,
      data.quantity,
      data.unit,
      data.cost_per_unit,
      data.supplier || null,
      data.purchase_date || null,
      data.expiry_date || null,
      data.min_stock_level || 10,
      data.notes || null
    );

    const stock = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({ 
      message: 'Stock item created successfully',
      stock 
    }, { status: 201 });
  } catch (error) {
    console.error('Create stock error:', error);
    return NextResponse.json(
      { error: 'Failed to create stock item' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    db.prepare(`
      UPDATE stock_items 
      SET item_name = ?, category = ?, quantity = ?, unit = ?,
          cost_per_unit = ?, supplier = ?, purchase_date = ?,
          expiry_date = ?, min_stock_level = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.item_name,
      data.category,
      data.quantity,
      data.unit,
      data.cost_per_unit,
      data.supplier || null,
      data.purchase_date || null,
      data.expiry_date || null,
      data.min_stock_level || 10,
      data.notes || null,
      data.id
    );

    const stock = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(data.id);

    return NextResponse.json({ 
      message: 'Stock item updated successfully',
      stock 
    });
  } catch (error) {
    console.error('Update stock error:', error);
    return NextResponse.json(
      { error: 'Failed to update stock item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    const db = Database.getInstance().db;
    db.prepare('DELETE FROM stock_items WHERE id = ?').run(id);

    return NextResponse.json({ 
      message: 'Stock item deleted successfully' 
    });
  } catch (error) {
    console.error('Delete stock error:', error);
    return NextResponse.json(
      { error: 'Failed to delete stock item' },
      { status: 500 }
    );
  }
}
