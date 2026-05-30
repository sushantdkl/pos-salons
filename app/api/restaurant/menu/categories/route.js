import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { AuthService } from '@/lib/auth/auth';

const authService = new AuthService();

// GET - List all categories
export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    // Get categories from menu_categories table
    const categories = db.prepare(`
      SELECT id, name, display_order, icon, is_active, created_at
      FROM menu_categories
      WHERE is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all();

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST - Create new category
export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || (user.role !== 'admin' && user.role !== 'cashier')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { name, icon, display_order } = await request.json();

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const db = Database.getInstance().db;

    // Check if category name already exists
    const existing = db.prepare(
      'SELECT id FROM menu_categories WHERE name = ? AND is_active = 1'
    ).get(name.trim());

    if (existing) {
      return NextResponse.json(
        { error: 'Category name already exists' },
        { status: 400 }
      );
    }

    // Get max display order if not provided
    let order = display_order;
    if (!order) {
      const maxOrder = db.prepare(
        'SELECT MAX(display_order) as max_order FROM menu_categories'
      ).get();
      order = (maxOrder?.max_order || 0) + 1;
    }

    // Insert new category
    const result = db.prepare(`
      INSERT INTO menu_categories (name, icon, display_order, is_active)
      VALUES (?, ?, ?, 1)
    `).run(name.trim(), icon || null, order);

    const category = db.prepare(
      'SELECT * FROM menu_categories WHERE id = ?'
    ).get(result.lastInsertRowid);

    return NextResponse.json({
      message: 'Category created successfully',
      category
    }, { status: 201 });
  } catch (error) {
    console.error('Create category error:', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}

// PUT - Update category
export async function PUT(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || (user.role !== 'admin' && user.role !== 'cashier')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id, name, icon, display_order } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const db = Database.getInstance().db;

    // Check if category exists
    const existing = db.prepare(
      'SELECT id FROM menu_categories WHERE id = ?'
    ).get(id);

    if (!existing) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Check if new name conflicts with another category
    const conflict = db.prepare(
      'SELECT id FROM menu_categories WHERE name = ? AND id != ? AND is_active = 1'
    ).get(name.trim(), id);

    if (conflict) {
      return NextResponse.json(
        { error: 'Category name already exists' },
        { status: 400 }
      );
    }

    // Update category
    db.prepare(`
      UPDATE menu_categories
      SET name = ?, icon = ?, display_order = ?
      WHERE id = ?
    `).run(name.trim(), icon || null, display_order || 0, id);

    const category = db.prepare(
      'SELECT * FROM menu_categories WHERE id = ?'
    ).get(id);

    return NextResponse.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Update category error:', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

// DELETE - Delete category
export async function DELETE(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    const db = Database.getInstance().db;

    // Check if category has any menu items
    const itemCount = db.prepare(
      'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?'
    ).get(id);

    if (itemCount && itemCount.count > 0) {
      return NextResponse.json(
        { error: `Cannot delete category. ${itemCount.count} menu items are using this category.` },
        { status: 400 }
      );
    }

    // Soft delete - mark as inactive
    db.prepare(
      'UPDATE menu_categories SET is_active = 0 WHERE id = ?'
    ).run(id);

    return NextResponse.json({
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
