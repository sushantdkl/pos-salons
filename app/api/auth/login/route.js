import { AuthService } from '@/lib/auth/auth.js';

export async function POST(request) {
  try {
    const { username, pin, deviceId } = await request.json();
    
    console.log('🔐 Login attempt:', { username, pin: pin ? `${pin.length} chars` : 'empty' });
    
    const authService = new AuthService();
    
    const result = await authService.authenticate(username, pin);
    
    if (!result.success) {
      return Response.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }
    
    // Register device (optional - skip if table doesn't exist)
    if (deviceId) {
      try {
        authService.registerDevice(
          deviceId,
          result.user.id,
          result.user.role,
          request.headers.get('x-forwarded-for') || 'unknown'
        );
      } catch (error) {
        console.log('⚠️ Device registration skipped:', error.message);
      }
    }
    
    return Response.json({
      success: true,
      user: result.user,
      token: result.token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
