export const APP_ROLES = ['admin', 'cashier', 'stylist', 'beautician'];

export const ROLE_LABELS = {
  admin: 'Admin',
  cashier: 'Cashier',
  stylist: 'Stylist',
  beautician: 'Beautician',
};

export const ROLE_DEMO_PASSWORDS = {
  admin: '123456',
  cashier: '1234',
  stylist: '2222',
  beautician: '3333',
};

export function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'cashier') return 'cashier';
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
