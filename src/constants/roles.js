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
