import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Database from '../db/index.js';

export class AuthService {
  constructor() {
    this.db = Database.getInstance();
  }
  
  async authenticate(username, password) {
    const user = this.db.get(`
      SELECT * FROM users 
      WHERE username = ? AND is_active = 1
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
    
    // Verify password using bcrypt
    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    
    if (!isValidPassword) {
      return { success: false, error: 'Invalid password' };
    }
    
    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    this.db.run(`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `, [user.id, sessionToken, expiresAt.toISOString()]);
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        email: user.email,
        phone: user.phone
      },
      token: sessionToken
    };
  }
  
  async verifySession(token) {
    const session = this.db.get(`
      SELECT s.*, u.id as user_id, u.username, u.full_name, u.role, u.email, u.phone
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `, [token]);
    
    if (!session) {
      return null;
    }
    
    return {
      id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: session.role,
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
      cashier: ['bills.*', 'orders.view', 'payments.*', 'tables.view'],
      waiter: ['orders.*', 'tables.*', 'menu.view'],
      kitchen: ['kots.*', 'orders.view', 'orders.update']
    };
    
    const userPermissions = permissions[userRole] || [];
    
    // Admin has all permissions
    if (userPermissions.includes('*')) return true;
    
    // Check exact match or wildcard match
    return userPermissions.some(p => {
      if (p.endsWith('.*')) {
        return permission.startsWith(p.slice(0, -2));
      }
      return p === permission;
    });
  }
  
  registerDevice(deviceId, userId, deviceType, ipAddress) {
    return this.db.run(`
      INSERT OR REPLACE INTO devices (device_id, user_id, device_type, ip_address, last_seen)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [deviceId, userId, deviceType, ipAddress]);
  }
  
  getActiveDevices() {
    return this.db.all(`
      SELECT d.*, u.full_name as user_name, u.role
      FROM devices d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.is_active = 1
      ORDER BY d.last_seen DESC
    `);
  }
}
