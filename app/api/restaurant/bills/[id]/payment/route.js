import { NextResponse } from 'next/server';
import { OrderRepository } from '@/lib/db/repositories/orders';
import { AuthService } from '@/lib/auth/auth';

const orderRepo = new OrderRepository();
const authService = new AuthService();

// Process payment for an order
export async function POST(request, { params }) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.verifySession(token);
    if (!user || (user.role !== 'cashier' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    
    const {
      payment_method,
      amount_paid,
      discount_amount = 0,
      discount_reason = '',
      split_payments = null,
      customer_name = '',
      customer_phone = ''
    } = body;

    // Validate payment data
    if (!payment_method && !split_payments) {
      return NextResponse.json(
        { error: 'Payment method is required' },
        { status: 400 }
      );
    }

    if (!amount_paid || amount_paid <= 0) {
      return NextResponse.json(
        { error: 'Invalid payment amount' },
        { status: 400 }
      );
    }

    // Get order details
    const order = orderRepo.getById(parseInt(id));
    
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch settings from database
    const Database = require('@/lib/db/index').default;
    const db = Database.getInstance().db;

    // Check if bill already exists for this order (prevent duplicates)
    const existingBill = db.prepare('SELECT id, bill_number, status FROM bills WHERE order_id = ? AND status = ?').get(parseInt(id), 'paid');
    if (existingBill) {
      return NextResponse.json(
        { 
          error: 'Bill already paid', 
          message: `This order has already been paid. Bill #${existingBill.bill_number}`,
          bill_number: existingBill.bill_number
        },
        { status: 400 }
      );
    }
    const settingsArray = db.prepare('SELECT setting_key, setting_value FROM system_settings').all();
    const settings = {};
    settingsArray.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    const vat_percentage = parseFloat(settings.vat_percentage || 13) / 100;
    const service_charge_percentage = parseFloat(settings.service_charge_percentage || 10) / 100;

    // Calculate final amount
    const subtotal = order.total_amount || 0;
    const tax_amount = subtotal * vat_percentage;
    const service_charge = subtotal * service_charge_percentage;
    const final_amount = subtotal + tax_amount + service_charge - discount_amount;

    // Verify payment amount (allow small rounding differences)
    if (Math.abs(amount_paid - final_amount) > 0.01) {
      return NextResponse.json(
        { 
          error: 'Payment amount mismatch',
          expected: final_amount.toFixed(2),
          received: amount_paid.toFixed(2)
        },
        { status: 400 }
      );
    }

    // Create bill and process payment
    const billData = {
      order_id: parseInt(id),
      table_id: order.table_id,
      subtotal,
      tax_amount,
      tax_percent: 13,
      service_charge,
      service_charge_percent: 10,
      discount_amount,
      discount_reason,
      final_amount,
      cashier_id: user.id,
      payment_method: split_payments ? 'split' : payment_method,
      split_payments: split_payments ? JSON.stringify(split_payments) : null,
      customer_name,
      customer_phone,
      reference_number: `PAY-${Date.now()}`
    };

    const { bill, payment } = orderRepo.createBillAndPayment(billData);

    // Update order status to served (payment completed)
    orderRepo.updateStatus(parseInt(id), 'served');

    // Get order items for receipt
    const orderItems = orderRepo.getOrderItems(parseInt(id));

    return NextResponse.json({
      success: true,
      payment,
      receipt: {
        order_id: order.id,
        order_number: order.order_number,
        table_number: order.table_number,
        items: orderItems,
        subtotal,
        tax_amount,
        service_charge,
        discount_amount,
        final_amount,
        amount_paid: final_amount,
        change: 0,
        payment_method: split_payments ? 'split' : payment_method,
        split_payments,
        customer_name: customer_name || '',
        customer_phone: customer_phone || '',
        processed_by: user.full_name,
        processed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process payment', details: error.message },
      { status: 500 }
    );
  }
}
