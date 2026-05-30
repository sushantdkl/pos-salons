import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = Database.getInstance().db;
    
    // Get order details
    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).get(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Get order items
    const items = db.prepare(`
      SELECT * FROM order_items WHERE order_id = ?
    `).all(id);

    return NextResponse.json({ order, items });
  } catch (error) {
    console.error('Get order details error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order details' },
      { status: 500 }
    );
  }
}
