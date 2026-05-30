import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';

export async function GET() {
  try {
    const dbInstance = Database.getInstance();
    const db = dbInstance.db;
    ensureSalonSchema(db);
    
    const users = db.prepare(`
      SELECT u.id, u.username,
             CASE
               WHEN u.full_name LIKE '%Restaurant%' THEN 'Salon Admin'
               WHEN u.full_name LIKE '%Waiter%' THEN REPLACE(u.full_name, 'Waiter', 'Stylist')
               WHEN u.full_name LIKE '%Chef%' THEN REPLACE(u.full_name, 'Chef', 'Beautician')
               WHEN u.full_name LIKE '%Cashier%' THEN REPLACE(u.full_name, 'Cashier', 'Receptionist')
               ELSE u.full_name
             END as full_name,
             COALESCE(sp.salon_role, CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'stylist' END) as role,
             u.email, u.phone
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY 
        CASE COALESCE(sp.salon_role, u.role)
          WHEN 'admin' THEN 1
          WHEN 'receptionist' THEN 2
          WHEN 'stylist' THEN 3
          WHEN 'barber' THEN 4
          WHEN 'beautician' THEN 5
          ELSE 5
        END,
        u.full_name
    `).all();

    return NextResponse.json({
      success: true,
      users: users
    });

  } catch (error) {
    console.error('Fetch users error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
