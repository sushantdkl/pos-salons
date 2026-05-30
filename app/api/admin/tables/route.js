import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { AuthService } from '@/lib/auth/auth';

const authService = new AuthService();

// GET - List all tables
export async function GET(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = Database.getInstance().db;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let query = `
      SELECT t.*, 
        o.order_number,
        u.full_name as waiter_name
      FROM tables t
      LEFT JOIN orders o ON t.current_order_id = o.id
      LEFT JOIN users u ON t.waiter_id = u.id
    `;

    if (!includeInactive) {
      query += ` WHERE t.is_active = 1`;
    }

    query += ` ORDER BY t.floor, t.section, t.table_number`;

    const tables = db.prepare(query).all();

    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Get tables error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tables', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new table
export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const data = await request.json();
    const {
      table_number,
      table_type = 'regular',
      floor = 'Ground',
      section,
      capacity = 4,
      min_capacity = 1,
      position_x = 0,
      position_y = 0,
      shape = 'square',
      color = '#3b82f6',
      notes
    } = data;

    if (!table_number) {
      return NextResponse.json(
        { error: 'Table number is required' },
        { status: 400 }
      );
    }

    const db = Database.getInstance().db;

    // Check if table number already exists
    const existing = db.prepare('SELECT id FROM tables WHERE table_number = ?').get(table_number);
    if (existing) {
      return NextResponse.json(
        { error: 'Table number already exists' },
        { status: 400 }
      );
    }

    const result = db.prepare(`
      INSERT INTO tables (
        table_number, table_type, floor, section, capacity, min_capacity,
        position_x, position_y, shape, color, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      table_number, table_type, floor, section, capacity, min_capacity,
      position_x, position_y, shape, color, notes
    );

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({
      success: true,
      message: 'Table created successfully',
      table
    }, { status: 201 });
  } catch (error) {
    console.error('Create table error:', error);
    return NextResponse.json(
      { error: 'Failed to create table', details: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update table
export async function PATCH(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const data = await request.json();
    const { id, ...updates } = data;

    if (!id) {
      return NextResponse.json(
        { error: 'Table ID is required' },
        { status: 400 }
      );
    }

    const db = Database.getInstance().db;

    // Build update query dynamically
    const allowedFields = [
      'table_number', 'table_type', 'floor', 'section', 'capacity', 'min_capacity',
      'position_x', 'position_y', 'status', 'shape', 'color', 'notes', 'is_active'
    ];

    const updateFields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`
      UPDATE tables 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).run(...values);

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);

    return NextResponse.json({
      success: true,
      message: 'Table updated successfully',
      table
    });
  } catch (error) {
    console.error('Update table error:', error);
    return NextResponse.json(
      { error: 'Failed to update table', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete table (soft delete)
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
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'Table ID is required' },
        { status: 400 }
      );
    }

    const db = Database.getInstance().db;

    // Check if table has active orders
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
    if (!table) {
      return NextResponse.json(
        { error: 'Table not found' },
        { status: 404 }
      );
    }

    if (table.status === 'occupied' || table.current_order_id) {
      return NextResponse.json(
        { error: 'Cannot delete table with active orders' },
        { status: 400 }
      );
    }

    if (permanent) {
      // Permanent delete
      db.prepare('DELETE FROM tables WHERE id = ?').run(id);
    } else {
      // Soft delete
      db.prepare('UPDATE tables SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }

    return NextResponse.json({
      success: true,
      message: permanent ? 'Table deleted permanently' : 'Table deactivated successfully'
    });
  } catch (error) {
    console.error('Delete table error:', error);
    return NextResponse.json(
      { error: 'Failed to delete table', details: error.message },
      { status: 500 }
    );
  }
}
