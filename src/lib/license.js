const WARNING_DAYS = 2;
const DEFAULT_GRACE_DAYS = 5;

export function isLicenseEnabled() {
  return process.env.NEXT_PUBLIC_LICENSE_ENABLED === 'true';
}

function disabledLicenseStatus() {
  return {
    isValid: true,
    status: 'disabled',
    message: 'License enforcement is disabled for testing.',
    daysRemaining: 9999,
    days_remaining: 9999,
    showWarning: false,
    isExpired: false,
    is_expired: false,
    inGracePeriod: false,
    in_grace_period: false,
  };
}

export function initializeLicenseTable() {
  return true;
}

export function getLicenseInfo() {
  if (!isLicenseEnabled()) {
    return {
      license_key: 'TESTING-DISABLED',
      salon_name: 'Salon POS',
      plan_type: 'Testing',
      expiry_date: '2099-12-31',
      grace_period_days: DEFAULT_GRACE_DAYS,
      status: 'disabled',
    };
  }

  return null;
}

export function saveLicenseInfo() {
  return !isLicenseEnabled();
}

export async function verifyLicenseOnline() {
  if (!isLicenseEnabled()) {
    return {
      valid: true,
      license_enabled: false,
      salon_name: 'Salon POS',
      plan_type: 'Testing',
      expiry_date: '2099-12-31',
      days_remaining: 9999,
    };
  }

  return {
    valid: false,
    error: 'License verification is reserved for the final production release.',
  };
}

export function calculateLicenseStatus(license) {
  if (!isLicenseEnabled()) {
    return disabledLicenseStatus();
  }

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
      in_grace_period: false,
    };
  }

  const now = new Date();
  const expiryDate = new Date(license.expiry_date);
  const diffTime = expiryDate - now;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    const gracePeriodDays = license.grace_period_days || DEFAULT_GRACE_DAYS;
    const graceRemaining = gracePeriodDays + daysRemaining;

    if (graceRemaining <= 0) {
      return {
        isValid: false,
        status: 'expired',
        message: 'License has expired. Please renew to continue using the system.',
        daysRemaining,
        days_remaining: daysRemaining,
        showWarning: true,
        isExpired: true,
        is_expired: true,
        inGracePeriod: false,
        in_grace_period: false,
        graceDaysOver: Math.abs(graceRemaining),
        grace_days_remaining: 0,
      };
    }

    return {
      isValid: true,
      status: 'grace',
      message: `License expired ${Math.abs(daysRemaining)} days ago. Grace period: ${graceRemaining} days remaining.`,
      daysRemaining,
      days_remaining: daysRemaining,
      showWarning: true,
      isExpired: true,
      is_expired: true,
      inGracePeriod: true,
      in_grace_period: true,
      graceRemaining,
      grace_days_remaining: graceRemaining,
    };
  }

  const showWarning = daysRemaining <= WARNING_DAYS;

  return {
    isValid: true,
    status: showWarning ? 'expiring_soon' : 'active',
    message: showWarning
      ? `License expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Please renew soon.`
      : `License active. Valid for ${daysRemaining} more days.`,
    daysRemaining,
    days_remaining: daysRemaining,
    showWarning,
    isExpired: false,
    is_expired: false,
    inGracePeriod: false,
    in_grace_period: false,
  };
}

export async function checkAndUpdateLicense() {
  if (!isLicenseEnabled()) {
    return disabledLicenseStatus();
  }

  return calculateLicenseStatus(getLicenseInfo());
}
