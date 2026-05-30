// License configuration
const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';
const WARNING_DAYS = 2; // Show warning 2 days before expiry
const DEFAULT_GRACE_DAYS = 5; // 5 days grace period

// Lazy-load db to avoid module initialization errors
function getDb() {
  const { default: db } = require('./db');
  return db;
}

export function initializeLicenseTable() {
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS license_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        restaurant_name TEXT,
        restaurant_address TEXT,
        restaurant_phone TEXT,
        restaurant_email TEXT,
        owner_name TEXT,
        plan_type TEXT,
        start_date DATE,
        expiry_date DATE NOT NULL,
        grace_period_days INTEGER DEFAULT 5,
        status TEXT DEFAULT 'active',
        last_verified DATETIME,
        activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return true;
  } catch (error) {
    console.error('Error initializing license table:', error);
    return false;
  }
}

export function getLicenseInfo() {
  try {
    // Ensure table exists
    initializeLicenseTable();
    
    const db = getDb();
    const license = db.prepare(`
      SELECT * FROM license_info LIMIT 1
    `).get();
    
    return license || null;
  } catch (error) {
    console.error('Error getting license info:', error);
    return null;
  }
}

export function saveLicenseInfo(licenseKey, licenseData) {
  try {
    const db = getDb();
    // Delete old license
    db.prepare('DELETE FROM license_info').run();
    
    // Support both restaurant and shop naming conventions
    const businessName = licenseData.restaurant_name || licenseData.shop_name || licenseData.business_name || 'Business';
    
    // Insert new license
    db.prepare(`
      INSERT INTO license_info (
        license_key, 
        restaurant_name,
        plan_type,
        start_date,
        expiry_date,
        grace_period_days,
        status,
        last_verified,
        activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      licenseKey,
      businessName,
      licenseData.plan_type || 'MONTHLY',
      licenseData.start_date || new Date().toISOString().split('T')[0],
      licenseData.expiry_date,
      licenseData.grace_period_days || DEFAULT_GRACE_DAYS,
      licenseData.status || 'active'
    );
    
    return true;
  } catch (error) {
    console.error('Error saving license:', error);
    return false;
  }
}

export async function verifyLicenseOnline(licenseKey) {
  try {
    const response = await fetch(`${ADMIN_SERVER_URL}/api/verify-license`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });

    if (!response.ok) {
      throw new Error('License verification failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Online verification failed:', error);
    return { valid: false, error: 'Cannot connect to license server' };
  }
}

export function calculateLicenseStatus(license) {
  if (!license) {
    return {
      isValid: false,
      status: 'no_license',
      message: 'No license found. Please activate your license.',
      daysRemaining: 0,
      days_remaining: 0,
      showWarning: false,
      isExpired: true,
      is_expired: true,
      inGracePeriod: false,
      in_grace_period: false
    };
  }

  const now = new Date();
  const expiryDate = new Date(license.expiry_date);
  const diffTime = expiryDate - now;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Check if expired
  if (daysRemaining < 0) {
    const gracePeriodDays = license.grace_period_days || DEFAULT_GRACE_DAYS;
    const graceRemaining = gracePeriodDays + daysRemaining;

    if (graceRemaining <= 0) {
      // Grace period ended - restrict access
      return {
        isValid: false,
        status: 'expired',
        message: 'License has expired. Please renew to continue using the system.',
        daysRemaining: daysRemaining,
        days_remaining: daysRemaining,
        showWarning: true,
        isExpired: true,
        is_expired: true,
        inGracePeriod: false,
        in_grace_period: false,
        graceDaysOver: Math.abs(graceRemaining),
        grace_days_remaining: 0
      };
    }

    // In grace period
    return {
      isValid: true,
      status: 'grace',
      message: `License expired ${Math.abs(daysRemaining)} days ago. Grace period: ${graceRemaining} days remaining.`,
      daysRemaining: daysRemaining,
      days_remaining: daysRemaining,
      showWarning: true,
      isExpired: true,
      is_expired: true,
      inGracePeriod: true,
      in_grace_period: true,
      graceRemaining: graceRemaining,
      grace_days_remaining: graceRemaining
    };
  }

  // Check if expiring soon (within 2 days)
  const showWarning = daysRemaining <= WARNING_DAYS;

  return {
    isValid: true,
    status: showWarning ? 'expiring_soon' : 'active',
    message: showWarning 
      ? `License expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Please renew soon.`
      : `License active. Valid for ${daysRemaining} more days.`,
    daysRemaining: daysRemaining,
    days_remaining: daysRemaining,
    showWarning: showWarning,
    isExpired: false,
    is_expired: false,
    inGracePeriod: false,
    in_grace_period: false
  };
}

export async function checkAndUpdateLicense() {
  const license = getLicenseInfo();
  
  if (!license || !license.license_key) {
    return calculateLicenseStatus(null);
  }

  // Calculate offline status
  const status = calculateLicenseStatus(license);

  // Try online verification if not recently verified
  const lastVerified = license.last_verified ? new Date(license.last_verified) : null;
  const hoursSinceVerification = lastVerified 
    ? (new Date() - lastVerified) / (1000 * 60 * 60) 
    : 999;

  // Verify online every 24 hours
  if (hoursSinceVerification > 24) {
    try {
      const onlineResult = await verifyLicenseOnline(license.license_key);
      
      if (onlineResult.valid) {
        // Update license info from server
        const db = getDb();
        db.prepare(`
          UPDATE license_info 
          SET last_verified = datetime('now'),
              expiry_date = ?,
              grace_period_days = ?,
              status = ?
          WHERE license_key = ?
        `).run(
          onlineResult.expiry_date || license.expiry_date,
          onlineResult.grace_period_days || license.grace_period_days,
          onlineResult.status || 'active',
          license.license_key
        );

        // Recalculate status with updated data
        const updatedLicense = getLicenseInfo();
        return calculateLicenseStatus(updatedLicense);
      }
    } catch (error) {
      console.error('Online verification error:', error);
      // Continue with offline status
    }
  }

  return status;
}
