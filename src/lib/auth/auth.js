import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Database from '../db/index.js';
import { dashboardPathForRole, normalizeRole } from '@/constants/roles';

export class AuthService {
  constructor() {
    this.db = Database.getInstance();
  }

  async authenticate(username, password) {
    const user = await this.db.get(`
      SELECT u.*, sp.salon_role
      FROM users u
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.username = ? AND u.is_active = TRUE
    `, [username]);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.password_hash) {
      console.error('User found but password_hash is null:', username);
      return { success: false, error: 'User account not properly configured' };
    }

    if (!password || typeof password !== 'string') {
      return { success: false, error: 'Invalid password format' };
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);

    if (!isValidPassword) {
      return { success: false, error: 'Invalid password' };
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db.run(`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `, [user.id, sessionToken, expiresAt.toISOString()]);

    const role = normalizeRole(user.role);
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role,
        email: user.email,
        phone: user.phone
      },
      token: sessionToken,
      redirectPath: dashboardPathForRole(role)
    };
  }

  async verifySession(token) {
    const session = await this.db.get(`
      SELECT s.*, u.id as user_id, u.username, u.full_name, u.role, u.email, u.phone,
             sp.salon_role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = TRUE
    `, [token]);

    if (!session) {
      return null;
    }

    return {
      id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: normalizeRole(session.role),
      email: session.email,
      phone: session.phone
    };
  }

  async logout(token) {
    return this.db.run(`
      DELETE FROM sessions WHERE token = ?
    `, [token]);
  }

  hasPermission(userRole, permission) {
    const permissions = {
      admin: ['*'],
      cashier: ['billing.*', 'customers.*', 'services.view', 'products.view', 'reminders.*'],
      barber: ['performance.view', 'services.view', 'customers.view'],
      stylist: ['billing.view', 'customers.view', 'services.view'],
      beautician: ['billing.view', 'customers.view', 'services.view']
    };

    const userPermissions = permissions[userRole] || [];

    if (userPermissions.includes('*')) return true;

    return userPermissions.some(p => {
      if (p.endsWith('.*')) {
        return permission.startsWith(p.slice(0, -2));
      }
      return p === permission;
    });
  }

  async registerDevice(deviceId, userId, deviceType, ipAddress) {
    return this.db.run(`
      INSERT INTO devices (device_id, user_id, device_type, ip_address, last_seen)
      VALUES (?, ?, ?, ?, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        device_type = EXCLUDED.device_type,
        ip_address = EXCLUDED.ip_address,
        last_seen = NOW()
    `, [deviceId, userId, deviceType, ipAddress]);
  }

  async getActiveDevices() {
    return this.db.all(`
      SELECT d.*, u.full_name as user_name, u.role
      FROM devices d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.is_active = TRUE
      ORDER BY d.last_seen DESC
    `);
  }
}
