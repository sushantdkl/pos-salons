import { OrderRepository } from '@/lib/db/repositories/orders.js';
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

// POST - Add items to existing order
export async function POST(request, context) {
  try {
    const user = await verifyAuth(request);
    const { params } = context;
    const { id: orderId } = await params;
    const { items } = await request.json();
    
    if (!items || items.length === 0) {
      return Response.json(
        { error: 'No items provided' },
        { status: 400 }
      );
    }
    
    const orderRepo = new OrderRepository();
    
    // Verify order exists and is not completed/cancelled
    const order = orderRepo.getById(orderId);
    if (!order) {
      return Response.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }
    
    if (['completed', 'cancelled'].includes(order.status)) {
      return Response.json(
        { error: 'Cannot add items to completed or cancelled orders' },
        { status: 400 }
      );
    }
    
    // Add items to order
    orderRepo.addItems(orderId, items);
    
    // Get updated order
    const updatedOrder = orderRepo.getById(orderId);
    const orderItems = orderRepo.getOrderItems(orderId);
    
    return Response.json({ 
      success: true,
      message: 'Items added successfully',
      order: updatedOrder,
      items: orderItems
    });
    
  } catch (error) {
    console.error('Add items error:', error);
    return Response.json(
      { error: error.message },
      { status: error.message.includes('authorization') ? 401 : 500 }
    );
  }
}
