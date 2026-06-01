export const APP_ROLES = ['admin', 'cashier', 'barber', 'stylist', 'beautician'];

export const ROLE_LABELS = {
  admin: 'Admin',
  cashier: 'Cashier',
  barber: 'Barber',
  stylist: 'Stylist',
  beautician: 'Beautician',
};

export const ROLE_DEMO_PINS = {
  admin: '1111',
  cashier: '2222',
  barber: '3333',
  stylist: '4444',
  beautician: '5555',
};

export const DEMO_ACCESS_PROFILES = [
  { username: 'admin', name: 'Admin', label: 'Admin', pin: '1111' },
  { username: 'kanchan', name: 'Kanchan', label: 'Cashier / Beautician', pin: '2222' },
  { username: 'raashid', name: 'Raashid', label: 'Barber', pin: '3333' },
  { username: 'salman', name: 'Salman', label: 'Barber', pin: '4444' },
  { username: 'saajid', name: 'Saajid', label: 'Barber', pin: '5555' },
];

export const DEMO_LOGIN_USERS = [
  { username: 'admin', full_name: 'Admin', role: 'admin', salon_role: 'admin' },
  { username: 'kanchan', full_name: 'Kanchan', role: 'cashier', salon_role: 'beautician' },
  { username: 'raashid', full_name: 'Raashid', role: 'barber', salon_role: 'barber' },
  { username: 'salman', full_name: 'Salman', role: 'barber', salon_role: 'barber' },
  { username: 'saajid', full_name: 'Saajid', role: 'barber', salon_role: 'barber' },
];

export const USER_DEMO_PINS = DEMO_ACCESS_PROFILES.reduce((pins, profile) => ({
  ...pins,
  [profile.username]: profile.pin,
}), {});

export const ROLE_DEMO_PASSWORDS = ROLE_DEMO_PINS;

export function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'cashier') return 'cashier';
  if (value === 'barber') return 'barber';
  if (value === 'beautician') return 'beautician';
  return 'stylist';
}

export function dashboardPathForRole(role) {
  const normalized = normalizeRole(role);
  return `/dashboard/${normalized}`;
}

export function canAccessPath(role, pathname) {
  const normalized = normalizeRole(role);

  if (pathname.startsWith('/dashboard/admin')) return normalized === 'admin';
  if (pathname.startsWith('/dashboard/cashier')) return normalized === 'cashier';
  if (pathname.startsWith('/dashboard/barber')) return normalized === 'barber';
  if (pathname.startsWith('/dashboard/stylist')) return normalized === 'stylist';
  if (pathname.startsWith('/dashboard/beautician')) return normalized === 'beautician';

  if (pathname.startsWith('/admin/employees') || pathname.startsWith('/admin/reports') || pathname.startsWith('/admin/settings')) {
    return normalized === 'admin';
  }

  if (
    pathname.startsWith('/admin/billing') ||
    pathname.startsWith('/admin/customers') ||
    pathname.startsWith('/admin/products') ||
    pathname.startsWith('/admin/stock') ||
    pathname.startsWith('/admin/reminders')
  ) {
    return ['admin', 'cashier'].includes(normalized);
  }

  if (pathname.startsWith('/admin')) return normalized === 'admin';

  return true;
}
