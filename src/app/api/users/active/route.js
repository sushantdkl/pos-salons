import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { normalizeRole } from '@/constants/roles';

export async function GET() {
  try {
    const dbInstance = Database.getInstance();
    const db = dbInstance.db;
    ensureSalonSchema(db);
    
    const users = db.prepare(`
      SELECT u.id, u.username,
             COALESCE(NULLIF(sp.display_name, ''), u.full_name) as full_name,
             COALESCE(sp.salon_role, u.role) as role,
             u.email, u.phone
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY 
        CASE COALESCE(sp.salon_role, u.role)
          WHEN 'admin' THEN 1
          WHEN 'cashier' THEN 2
          WHEN 'stylist' THEN 3
          WHEN 'beautician' THEN 4
          ELSE 6
        END,
        u.full_name
    `).all();

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({ ...user, role: normalizeRole(user.role) }))
    });

  } catch (error) {
    console.error('Fetch users error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
