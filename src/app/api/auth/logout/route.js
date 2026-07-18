import { AuthService } from '@/lib/auth/auth.js';

function tokenFromAuthorization(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function tokenFromBody(request) {
  try {
    const text = await request.text();
    if (!text?.trim()) return '';
    const body = JSON.parse(text);
    return String(body?.token || '').trim();
  } catch {
    return '';
  }
}

export async function POST(request) {
  try {
    const token = tokenFromAuthorization(request) || (await tokenFromBody(request));
    if (token) {
      const authService = new AuthService();
      await authService.logout(token);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    // Client already clears local session; do not block logout UX.
    return Response.json({ success: true, warning: 'Session cleanup skipped' });
  }
}
