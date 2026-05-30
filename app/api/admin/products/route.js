import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    const products = db.prepare(`
      SELECT 
        mi.*,
        mi.base_price as price,
        mc.name as category_name
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      ORDER BY mi.name
    `).all();

    return NextResponse.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    const price = data.price || data.base_price || 0;

    const result = db.prepare(`
      INSERT INTO menu_items (
        name, item_code, category_id, base_price, description, 
        is_available, is_vegetarian, preparation_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.item_code || `ITEM-${Date.now()}`,
      data.category_id || 1,
      price,
      data.description || null,
      data.is_available ? 1 : 0,
      data.is_vegetarian ? 1 : 0,
      data.preparation_time || 15
    );

    const product = db.prepare(`
      SELECT *
      FROM menu_items
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return NextResponse.json({ 
      message: 'Product created successfully',
      product 
    }, { status: 201 });
  } catch (error) {
    console.error('Create product error:', error);
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    );
  }
}


