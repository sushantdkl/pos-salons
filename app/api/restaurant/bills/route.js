import { NextResponse } from 'next/server';
import { BillRepository } from '@/lib/db/repositories/bills.js';
import { AuthService } from '@/lib/auth/auth.js';

const billRepo = new BillRepository();
const authService = new AuthService();

// Middleware to verify authentication
async function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const session = await authService.verifySession(token);
  
  return session;
}

// GET - Get bill by ID or today's bills or sales summary
export async function GET(request) {
  try {
    const session = await verifyAuth(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type'); // 'today' or 'summary'
    const date = searchParams.get('date');
    
    // Get specific bill with full details
    if (id) {
      const bill = await billRepo.getById(parseInt(id));
      
      if (!bill) {
        return NextResponse.json(
          { error: 'Bill not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        bill
      });
    }
    
    // Get today's bills
    if (type === 'today') {
      const bills = await billRepo.getTodaysBills();
      
      return NextResponse.json({
        success: true,
        bills,
        count: bills.length
      });
    }
    
    // Get sales summary
    if (type === 'summary') {
      const summary = await billRepo.getSalesSummary(date || new Date().toISOString().split('T')[0]);
      
      return NextResponse.json({
        success: true,
        summary
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid request. Provide id, type=today, or type=summary' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Bills GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// POST - Create new bill or add payment
export async function POST(request) {
  try {
    const session = await verifyAuth(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Check if user has permission to create bills
    if (!authService.hasPermission(session.role, 'bills.create')) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { action, bill_id, ...billData } = body;
    
    // Add payment to existing bill
    if (action === 'add-payment') {
      const { payment_method, amount } = body;
      
      if (!bill_id || !payment_method || !amount) {
        return NextResponse.json(
          { error: 'Missing required fields: bill_id, payment_method, amount' },
          { status: 400 }
        );
      }
      
      const paymentId = await billRepo.addPayment(bill_id, {
        payment_method,
        amount,
        processed_by: session.user_id
      });
      
      const bill = await billRepo.getById(bill_id);
      
      return NextResponse.json({
        success: true,
        message: 'Payment added successfully',
        payment_id: paymentId,
        bill
      });
    }
    
    // Create new bill
    const {
      order_id,
      customer_id,
      table_id,
      items,
      subtotal,
      service_charge_percentage,
      tax_percentage,
      discount_amount,
      discount_reason
    } = billData;
    
    // Validate required fields
    if (!order_id || !items || !subtotal) {
      return NextResponse.json(
        { error: 'Missing required fields: order_id, items, subtotal' },
        { status: 400 }
      );
    }
    
    const billId = await billRepo.create({
      order_id,
      customer_id: customer_id || null,
      table_id: table_id || null,
      items,
      subtotal,
      service_charge_percentage: service_charge_percentage || 10,
      tax_percentage: tax_percentage || 13,
      discount_amount: discount_amount || 0,
      discount_reason: discount_reason || null,
      created_by: session.user_id
    });
    
    // Get the created bill with full details
    const bill = await billRepo.getById(billId);
    
    return NextResponse.json({
      success: true,
      message: 'Bill created successfully',
      bill
    }, { status: 201 });
    
  } catch (error) {
    console.error('Bills POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create bill or add payment' },
      { status: 500 }
    );
  }
}

// PATCH - Mark bill as paid
export async function PATCH(request) {
  try {
    const session = await verifyAuth(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Check if user has permission to update bills
    if (!authService.hasPermission(session.role, 'bills.update')) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing bill ID' },
        { status: 400 }
      );
    }
    
    const updated = await billRepo.markAsPaid(id);
    
    if (!updated) {
      return NextResponse.json(
        { error: 'Bill not found or already paid' },
        { status: 404 }
      );
    }
    
    const bill = await billRepo.getById(id);
    
    return NextResponse.json({
      success: true,
      message: 'Bill marked as paid',
      bill
    });
    
  } catch (error) {
    console.error('Bills PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update bill' },
      { status: 500 }
    );
  }
}
