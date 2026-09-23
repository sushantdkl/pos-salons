import { clearLoginFailures, clientIp, loginLockout, recordLoginFailure } from '@/lib/security/rate-limit';
import { AuthService } from '@/lib/auth/auth.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { username, password, deviceId } = await request.json();
    // Brute-force guard: repeated wrong PINs for one user from one address lock that pair
    // for a while. Successful logins never count against anyone.
    const lockKey = `${clientIp(request)}:${String(username || '').trim().toLowerCase()}`;
    const lock = loginLockout(lockKey);
    if (lock.locked) {
      return Response.json(
        { success: false, error: `Too many failed attempts. Try again in ${Math.ceil(lock.retryAfterSeconds / 60)} minute(s).` },
        { status: 429, headers: { 'Retry-After': String(lock.retryAfterSeconds) } }
      );
    }
    const authService = new AuthService();
    const result = await authService.authenticate(username, password);

    if (!result.success) {
      recordLoginFailure(lockKey);
      return Response.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }
    clearLoginFailures(lockKey);

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
