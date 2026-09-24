export const APP_ROLES = ['admin', 'cashier', 'barber', 'stylist', 'beautician'];

export const ROLE_LABELS = {
  admin: 'Admin',
  cashier: 'Cashier',
  barber: 'Barber',
  stylist: 'Stylist',
  beautician: 'Beautician',
};

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
  if (pathname.startsWith('/dashboard/cashier/tokens')) return normalized === 'cashier';
  if (pathname.startsWith('/dashboard/cashier')) return normalized === 'cashier';
  if (pathname.startsWith('/dashboard/barber/queue')) return normalized === 'barber';
  if (pathname.startsWith('/dashboard/barber')) return normalized === 'barber';
  if (pathname.startsWith('/dashboard/stylist/queue')) return normalized === 'stylist';
  if (pathname.startsWith('/dashboard/stylist')) return normalized === 'stylist';
  if (pathname.startsWith('/dashboard/beautician/queue')) return normalized === 'beautician';
  if (pathname.startsWith('/dashboard/beautician')) return normalized === 'beautician';

  if (
    pathname.startsWith('/admin/employees') ||
    pathname.startsWith('/admin/reports') ||
    pathname.startsWith('/admin/settings') ||
    pathname.startsWith('/admin/appointments/settings')
  ) {
    return normalized === 'admin';
  }

  // Every employee has their own attendance page (self punches, own history, own leave).
  if (pathname.startsWith('/attendance/my')) return ['cashier', 'barber', 'stylist', 'beautician'].includes(normalized);
  // HR workspace: admin, and a cashier the owner delegated HR permissions to (APIs enforce each one).
  if (pathname.startsWith('/admin/hrm/rules')) return normalized === 'admin';
  if (pathname.startsWith('/admin/hrm')) return ['admin', 'cashier'].includes(normalized);

  // Front desk runs appointments; service staff see only their own schedule.
  if (pathname.startsWith('/admin/appointments')) return ['admin', 'cashier'].includes(normalized);
  if (pathname.startsWith('/appointments/my')) return ['barber', 'stylist', 'beautician'].includes(normalized);

  if (
    pathname.startsWith('/admin/billing') ||
    pathname.startsWith('/admin/customers') ||
    pathname.startsWith('/admin/customer-ledger') ||
    pathname.startsWith('/admin/products') ||
    pathname.startsWith('/admin/stock') ||
    pathname.startsWith('/admin/reminders')
  ) {
    return ['admin', 'cashier'].includes(normalized);
  }

  // The cashier report area. Admin keeps its own copy under /admin, so this is the
  // cashier's route; the API enforces the same pair server-side.
  if (pathname.startsWith('/cashier')) return ['admin', 'cashier'].includes(normalized);

  // Opening & Closing is shared by the two roles that run the till; the store APIs
  // enforce the same pair server-side.
  if (pathname.startsWith('/store')) return ['admin', 'cashier'].includes(normalized);

  // Suppliers & purchases can be delegated to the cashier in Staff Permissions (APIs enforce it).
  if (pathname.startsWith('/admin/suppliers') || pathname.startsWith('/admin/purchases') || pathname.startsWith('/admin/supplier-ledger')) return ['admin', 'cashier'].includes(normalized);
  if (pathname.startsWith('/admin')) return normalized === 'admin';

  return true;
}
