import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function PUT(request, context) {
  try {
    const { id } = await context.params;
    const data = await request.json();
    const db = Database.getInstance().db;

    const price = data.price || data.base_price || 0;

    // Get category name from category_id
    let categoryName = 'General';
    if (data.category_id) {
      const category = db.prepare('SELECT name FROM menu_categories WHERE id = ?').get(data.category_id);
      if (category) {
        categoryName = category.name;
      }
    }

    db.prepare(`
      UPDATE menu_items 
      SET name = ?, category = ?, category_id = ?, price = ?, base_price = ?, 
          description = ?, is_available = ?, is_vegetarian = ?,
          preparation_time = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.name,
      categoryName,
      data.category_id || null,
      price,
      price,
      data.description || null,
      data.is_available ? 1 : 0,
      data.is_vegetarian ? 1 : 0,
      data.preparation_time || 15,
      id
    );

    const product = db.prepare(`
      SELECT 
        mi.*,
        mi.base_price as price,
        mc.name as category
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mi.id = ?
    `).get(id);

    return NextResponse.json({ 
      message: 'Product updated successfully',
      product 
    });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json(
      { error: 'Failed to update product', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, context) {
  try {
    const { id } = await context.params;
    const db = Database.getInstance().db;
    
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);

    return NextResponse.json({ 
      message: 'Product deleted successfully' 
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return NextResponse.json(
      { error: 'Failed to delete product', details: error.message },
      { status: 500 }
    );
  }
}
