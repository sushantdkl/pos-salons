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

// GET - List orders
export async function GET(request) {
  try {
    const user = await verifyAuth(request);
    const { searchParams } = new URL(request.url);
    
    const filters = {
      status: searchParams.get('status'),
      waiter_id: searchParams.get('waiter_id'),
      order_type: searchParams.get('order_type'),
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')) : null
    };
    
    // Remove null values
    Object.keys(filters).forEach(key => filters[key] === null && delete filters[key]);
    
    const orderRepo = new OrderRepository();
    const orders = orderRepo.getAll(filters);
    
    return Response.json({ orders });
    
  } catch (error) {
    console.error('Get orders error:', error);
    return Response.json(
      { error: error.message },
      { status: error.message.includes('authorization') ? 401 : 500 }
    );
  }
}

// POST - Create order
export async function POST(request) {
  try {
    const user = await verifyAuth(request);
    const orderData = await request.json();
    
    // Add waiter_id from authenticated user if role is waiter
    if (user.role === 'waiter') {
      orderData.waiter_id = user.user_id;
    }
    
    const orderRepo = new OrderRepository();
    const result = orderRepo.create(orderData);
    
    const order = orderRepo.getById(result.order_id);
    
    return Response.json({ 
      success: true, 
      order,
      order_id: result.order_id,
      order_number: result.order_number
    }, { status: 201 });
    
  } catch (error) {
    console.error('Create order error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Update order status
export async function PATCH(request) {
  try {
    const user = await verifyAuth(request);
    const { id, status, cancel_reason } = await request.json();
    
    const orderRepo = new OrderRepository();
    
    if (status === 'cancelled') {
      orderRepo.cancelOrder(id, cancel_reason || 'No reason provided');
    } else {
      orderRepo.updateStatus(id, status);
    }
    
    const order = orderRepo.getById(id);
    
    return Response.json({ success: true, order });
    
  } catch (error) {
    console.error('Update order error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
