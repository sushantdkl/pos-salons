import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { normalizeRole } from '@/constants/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbInstance = Database.getInstance();
    const db = dbInstance;
    await ensureSalonSchema();
    
    const users = await db.all(`
      SELECT u.id, u.username,
             COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name,
             u.role,
             sp.salon_role,
             u.email, u.phone
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = TRUE
      ORDER BY
        CASE u.role
          WHEN 'admin' THEN 1
          WHEN 'cashier' THEN 2
          WHEN 'barber' THEN 3
          WHEN 'stylist' THEN 4
          WHEN 'beautician' THEN 5
          ELSE 6
        END,
        COALESCE(NULLIF(sp.display_name, ''), u.full_name),
        u.username
    `);

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({
        ...user,
        role: normalizeRole(user.role),
        salon_role: normalizeRole(user.salon_role || user.role),
      }))
    });

  } catch (error) {
    console.error('Fetch users error:', error);
    const message = /DATABASE_URL must be a postgres/i.test(error?.message || '')
      ? 'Database is not configured. Set DATABASE_URL to a postgresql:// connection string in .env.local, then restart npm run dev.'
      : 'Failed to fetch users';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
