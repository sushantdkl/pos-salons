import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    // Create expenses table if it doesn't exist
    db.prepare(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        purchase_date TEXT,
        supplier TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    const expenses = db.prepare(`
      SELECT * FROM expenses
      ORDER BY purchase_date DESC, created_at DESC
    `).all();

    return NextResponse.json({ expenses });
  } catch (error) {
    console.error('Get expenses error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    const result = db.prepare(`
      INSERT INTO expenses (
        description, category, amount, purchase_date, supplier, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.description,
      data.category,
      data.amount,
      data.purchase_date || new Date().toISOString().split('T')[0],
      data.supplier || null,
      data.notes || null
    );

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({ 
      message: 'Expense created successfully',
      expense 
    }, { status: 201 });
  } catch (error) {
    console.error('Create expense error:', error);
    return NextResponse.json(
      { error: 'Failed to create expense' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    db.prepare(`
      UPDATE expenses 
      SET description = ?, category = ?, amount = ?,
          purchase_date = ?, supplier = ?, notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.description,
      data.category,
      data.amount,
      data.purchase_date || new Date().toISOString().split('T')[0],
      data.supplier || null,
      data.notes || null,
      data.id
    );

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(data.id);

    return NextResponse.json({ 
      message: 'Expense updated successfully',
      expense 
    });
  } catch (error) {
    console.error('Update expense error:', error);
    return NextResponse.json(
      { error: 'Failed to update expense' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    const db = Database.getInstance().db;
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

    return NextResponse.json({ 
      message: 'Expense deleted successfully' 
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    return NextResponse.json(
      { error: 'Failed to delete expense' },
      { status: 500 }
    );
  }
}
