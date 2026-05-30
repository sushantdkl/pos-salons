import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    // Create inventory items table if it doesn't exist
    db.prepare(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        cost_per_unit REAL NOT NULL,
        selling_price REAL,
        min_stock_level REAL DEFAULT 5,
        supplier TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    const items = db.prepare(`
      SELECT * FROM inventory_items
      ORDER BY created_at DESC
    `).all();

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    const result = db.prepare(`
      INSERT INTO inventory_items (
        item_name, quantity, unit, cost_per_unit, selling_price,
        min_stock_level, supplier, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.item_name,
      data.quantity,
      data.unit,
      data.cost_per_unit,
      data.selling_price || null,
      data.min_stock_level || 5,
      data.supplier || null,
      data.notes || null
    );

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({ 
      message: 'Inventory item created successfully',
      item 
    }, { status: 201 });
  } catch (error) {
    console.error('Create inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    db.prepare(`
      UPDATE inventory_items 
      SET item_name = ?, quantity = ?, unit = ?, cost_per_unit = ?,
          selling_price = ?, min_stock_level = ?, supplier = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.item_name,
      data.quantity,
      data.unit,
      data.cost_per_unit,
      data.selling_price || null,
      data.min_stock_level || 5,
      data.supplier || null,
      data.notes || null,
      data.id
    );

    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(data.id);

    return NextResponse.json({ 
      message: 'Inventory item updated successfully',
      item 
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to update inventory item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    const db = Database.getInstance().db;
    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);

    return NextResponse.json({ 
      message: 'Inventory item deleted successfully' 
    });
  } catch (error) {
    console.error('Delete inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}
