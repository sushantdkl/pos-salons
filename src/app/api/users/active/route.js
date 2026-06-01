import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { normalizeRole } from '@/constants/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbInstance = Database.getInstance();
    const db = dbInstance.db;
    ensureSalonSchema(db);
    
    const users = db.prepare(`
      SELECT u.id, u.username,
             COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name,
             u.role,
             sp.salon_role,
             u.email, u.phone
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY 
        CASE u.username
          WHEN 'admin' THEN 1
          WHEN 'kanchan' THEN 2
          WHEN 'raashid' THEN 3
          WHEN 'salman' THEN 4
          WHEN 'saajid' THEN 5
          ELSE 6
        END,
        u.full_name
    `).all();

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
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
