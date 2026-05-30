import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request) {
  try {
    const db = Database.getInstance().db;
    
    const orders = db.prepare(`
      SELECT 
        o.*,
        b.grand_total as total,
        b.subtotal,
        b.tax,
        b.discount_amount,
        b.service_charge,
        b.bill_number,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN bills b ON b.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance().db;

    db.prepare(`
      UPDATE orders 
      SET status = ?
      WHERE id = ?
    `).run(data.status, data.id);

    return NextResponse.json({ 
      message: 'Order status updated successfully' 
    });
  } catch (error) {
    console.error('Update order error:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
