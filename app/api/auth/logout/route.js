import { AuthService } from '@/lib/auth/auth.js';

export async function POST(request) {
  try {
    const { token } = await request.json();
    
    const authService = new AuthService();
    
    await authService.logout(token);
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
