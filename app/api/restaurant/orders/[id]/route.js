import { OrderRepository } from '@/lib/db/repositories/orders.js';
import { KotRepository } from '@/lib/db/repositories/kots.js';
import { AuthService } from '@/lib/auth/auth.js';

async function verifyAuth(request) {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    throw new Error('No authorization token');
  }
  
  const authService = new AuthService();
  const user = await authService.verifySession(token);
  
  if (!user) {
    throw new Error('Invalid session');
  }
  
  return user;
}

// GET - Get single order with items and KOTs
export async function GET(request, context) {
  try {
    const user = await verifyAuth(request);
    const { params } = context;
    const { id: orderId } = await params;
    
    const orderRepo = new OrderRepository();
    const kotRepo = new KotRepository();
    
    const order = orderRepo.getById(orderId);
    
    if (!order) {
      return Response.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }
    
    const items = orderRepo.getOrderItems(orderId);
    const kots = kotRepo.getByOrder(orderId);
    
    return Response.json({ order, items, kots });
    
  } catch (error) {
    console.error('Get order details error:', error);
    return Response.json(
      { error: error.message },
      { status: error.message.includes('authorization') ? 401 : 500 }
    );
  }
}

// PUT - Update order
export async function PUT(request, context) {
  try {
    const user = await verifyAuth(request);
    const { params } = context;
    const { id: orderId } = await params;
    const updateData = await request.json();
    
    const orderRepo = new OrderRepository();
    
    if (updateData.status) {
      if (updateData.status === 'cancelled') {
        orderRepo.cancelOrder(orderId, updateData.cancel_reason || 'Cancelled by waiter');
      } else {
        orderRepo.updateStatus(orderId, updateData.status);
      }
    }
    
    const order = orderRepo.getById(orderId);
    
    return Response.json({ success: true, order });
    
  } catch (error) {
    console.error('Update order error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Cancel order
export async function DELETE(request, context) {
  try {
    const user = await verifyAuth(request);
    const { params } = context;
    const { id: orderId } = await params;
    const { cancel_reason } = await request.json();
    
    const orderRepo = new OrderRepository();
    orderRepo.cancelOrder(orderId, cancel_reason || 'Cancelled by user');
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Cancel order error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
