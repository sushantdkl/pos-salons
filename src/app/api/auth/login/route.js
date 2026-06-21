import { AuthService } from '@/lib/auth/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { username, password, deviceId } = await request.json();
    const authService = new AuthService();
    const result = await authService.authenticate(username, password);

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }

    if (deviceId) {
      try {
        await authService.registerDevice(
          deviceId,
          result.user.id,
          result.user.role,
          request.headers.get('x-forwarded-for') || 'unknown'
        );
      } catch {
        // Device tracking is non-critical for login.
      }
    }

    return Response.json({
      success: true,
      user: result.user,
      token: result.token,
      redirectPath: result.redirectPath,
    });
  } catch (error) {
    console.error('Login error:', error?.message || error, error?.stack);
    const hint = /DATABASE_URL must be a postgres/i.test(error?.message || '')
      ? 'Database is not configured on the server. Set DATABASE_URL to the cPanel PostgreSQL connection string.'
      : /ECONNREFUSED|ETIMEDOUT|timeout|Connection terminated/i.test(error?.message || '')
        ? 'Cannot reach PostgreSQL from the app server. Verify cPanel database host, port, username, password, privileges, and PG_SSL setting.'
        : 'Login failed';
    return Response.json({ success: false, error: hint }, { status: 500 });
  }
}
