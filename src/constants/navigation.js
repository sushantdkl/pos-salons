/**
 * THE navigation definition for every role — the only place a sidebar link is declared.
 *
 * Rules (see docs/ERP_UPGRADE_PLAN.md §6):
 *   - Only routes that exist. No placeholders, no "coming soon".
 *   - A route appears once per role.
 *   - Groups carry a module-family tint; colour means family, never decoration.
 *   - Visibility here is convenience only. canAccessPath() and every API enforce access.
 */
import {
  Award, BadgeDollarSign, Banknote, BookOpen, BookUser, CalendarClock, CalendarCog, CalendarDays, CalendarOff, ClipboardCheck, ClipboardList, ClipboardPen, Clock, HeartHandshake, ChartColumnBig, ChartPie, Coins, Contact, DoorOpen,
  GitCompareArrows, Globe, HandCoins, LayoutDashboard, ListOrdered, ListTodo, MessageCircle, MessageSquareHeart,
  PackagePlus, PackageSearch, PiggyBank, Printer, Receipt, ReceiptText, Scale, Scissors, ScrollText,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Store, Ticket, Timer, TrendingUp, Truck, UserCheck, Users, Wallet, WalletCards, Warehouse,
} from 'lucide-react';

/**
 * Module family -> tint. Static literal Tailwind classes so the compiler keeps them.
 * bg: group band · header: label colour · active: active child row · bar: active marker ·
 * tile: the coloured square behind each icon.
 */
export const NAV_TINTS = {
  reports: { bg: 'bg-indigo-50', header: 'text-indigo-800', hover: 'hover:bg-indigo-100', active: 'bg-indigo-100 text-indigo-950', bar: 'bg-indigo-600', icon: 'text-indigo-600', tile: 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100' },
  operations: { bg: 'bg-teal-50', header: 'text-teal-800', hover: 'hover:bg-teal-100', active: 'bg-teal-100 text-teal-950', bar: 'bg-teal-600', icon: 'text-teal-600', tile: 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-100' },
  inventory: { bg: 'bg-lime-50', header: 'text-lime-800', hover: 'hover:bg-lime-100', active: 'bg-lime-100 text-lime-950', bar: 'bg-lime-600', icon: 'text-lime-700', tile: 'bg-white text-lime-700 shadow-sm ring-1 ring-lime-100' },
  finance: { bg: 'bg-amber-50', header: 'text-amber-800', hover: 'hover:bg-amber-100', active: 'bg-amber-100 text-amber-950', bar: 'bg-amber-600', icon: 'text-amber-600', tile: 'bg-white text-amber-600 shadow-sm ring-1 ring-amber-100' },
  hrm: { bg: 'bg-violet-50', header: 'text-violet-800', hover: 'hover:bg-violet-100', active: 'bg-violet-100 text-violet-950', bar: 'bg-violet-600', icon: 'text-violet-600', tile: 'bg-white text-violet-600 shadow-sm ring-1 ring-violet-100' },
  crm: { bg: 'bg-rose-50', header: 'text-rose-800', hover: 'hover:bg-rose-100', active: 'bg-rose-100 text-rose-950', bar: 'bg-rose-600', icon: 'text-rose-600', tile: 'bg-white text-rose-600 shadow-sm ring-1 ring-rose-100' },
  system: { bg: 'bg-stone-100', header: 'text-stone-700', hover: 'hover:bg-stone-200', active: 'bg-stone-200 text-stone-950', bar: 'bg-stone-600', icon: 'text-stone-500', tile: 'bg-stone-200 text-stone-600' },
  top: { bg: '', header: 'text-stone-700', hover: 'hover:bg-stone-100', active: 'bg-stone-900 text-white', bar: 'bg-stone-900', icon: 'text-stone-600', tile: 'bg-stone-100 text-stone-600' },
};

const link = (label, href, icon, extra = {}) => ({ label, href, icon, ...extra });

/** Colour tiles for main (top-level) links — each its own hue so the sidebar scans quickly. */
export const ICON_TILES = {
  sky: 'bg-sky-100 text-sky-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-600',
  orange: 'bg-orange-100 text-orange-600',
  cyan: 'bg-cyan-100 text-cyan-700',
  blue: 'bg-blue-100 text-blue-600',
  teal: 'bg-teal-100 text-teal-600',
  slate: 'bg-slate-200 text-slate-600',
  violet: 'bg-violet-100 text-violet-600',
};
const TOP_COLOURS = {
  Dashboard: 'sky', POS: 'emerald', Analytics: 'indigo', Summary: 'amber', Customers: 'rose', 'Customer Ledger': 'fuchsia',
  'Supplier Ledger': 'orange', 'Staff Permissions': 'cyan', 'Website CMS': 'blue', Printer: 'teal', Settings: 'slate',
  Queue: 'teal', 'My Appointments': 'rose', 'My Attendance': 'violet',
};
export function tileFor(item) {
  return ICON_TILES[item.color || TOP_COLOURS[item.label]] || ICON_TILES.slate;
}
const group = (id, label, tint, icon, items) => ({ id, label, tint, icon, items });

const ADMIN_NAV = [
  link('Dashboard', '/dashboard/admin', LayoutDashboard, { exact: true }),
  link('POS', '/admin/billing', Store),
  link('Analytics', '/admin/analytics', ChartColumnBig),
  link('Summary', '/admin/executive-summary', ScrollText),
  // Everyday essentials stay one click away, outside any dropdown.
  link('Customers', '/admin/customers', Contact),
  link('Customer Ledger', '/admin/customer-ledger', BookUser),
  link('Supplier Ledger', '/admin/supplier-ledger', BookOpen),
  group('reports', 'Reports', 'reports', ChartPie, [
    link('Business Overview', '/admin/reports', ChartPie, { exact: true }),
    link('Sales & Invoices', '/admin/reports/center/sales', ReceiptText),
    link('Services Report', '/admin/reports/center/services', Scissors),
    link('Products & Retail', '/admin/reports/center/products', PackageSearch),
    link('Payment Reconciliation', '/admin/reports/center/payments', WalletCards),
    link('Expenses Report', '/admin/reports/center/expenses', BadgeDollarSign),
    link('Token Report', '/dashboard/admin/reports/tokens', Ticket),
    link('Transactions', '/admin/reports/transactions', ListOrdered),
    link('Business Day History', '/dashboard/admin/business-days', CalendarDays),
    link('Staff Performance', '/dashboard/admin/staff-performance', TrendingUp),
    link('Attendance Reports', '/admin/hrm/reports', ClipboardList),
    link('Advances Report', '/admin/reports/center/advances', Scale),
    link('Compare Periods', '/admin/reports/compare', GitCompareArrows),
  ]),
  group('operations', 'Salon Operations', 'operations', Scissors, [
    link('Tokens / Queue', '/dashboard/admin/tokens', ListTodo),
    link('Services', '/admin/products', Sparkles),
    link('Reminders', '/admin/reminders', MessageCircle),
  ]),
  group('crm', 'CRM & Growth', 'crm', HeartHandshake, [
    link('Appointments', '/admin/appointments', CalendarClock),
    link('Hours & Booking', '/admin/appointments/settings', CalendarCog),
    link('Loyalty', '/admin/crm/loyalty', Award),
    link('Customer Reviews', '/admin/crm/reviews', MessageSquareHeart),
    link('Feedback Forms', '/admin/crm/reviews/forms', ClipboardPen),
  ]),
  group('inventory', 'Inventory', 'inventory', Warehouse, [
    link('Products & Stock', '/admin/stock', Warehouse),
    link('Purchases', '/admin/purchases', PackagePlus),
    link('Suppliers', '/admin/suppliers', Truck),
  ]),
  group('finance', 'Finance', 'finance', Wallet, [
    link('Opening & Closing', '/store/opening-closing', DoorOpen),
    link('Expenses', '/dashboard/admin/expenses', Receipt),
    link('Savings', '/admin/savings', PiggyBank),
    link('Credit Collection', '/cashier/credit', Wallet),
  ]),
  group('hrm', 'HRM', 'hrm', Users, [
    link('Employees', '/admin/employees', Users),
    link('Attendance', '/admin/hrm/attendance', UserCheck),
    link('Shifts & Roster', '/admin/hrm/shifts', Clock),
    link('Leave Management', '/admin/hrm/leave', CalendarOff),
    link('Overtime', '/admin/hrm/overtime', Timer),
    link('Salary & Payroll', '/dashboard/admin/expenses/salary', Banknote),
    link('Salary Advances', '/cashier/advances', Coins),
    link('HR Rules', '/admin/hrm/rules', SlidersHorizontal),
  ]),
  // Administration: main links, no System dropdown.
  link('Staff Permissions', '/admin/permissions', ShieldCheck, { separatorBefore: true }),
  link('Website CMS', '/dashboard/admin/website', Globe),
  link('Printer', '/admin/printer', Printer),
  link('Settings', '/admin/settings', Settings),
];

// Cashier: the operational items it had before, grouped, plus front-desk Appointments.
const CASHIER_NAV = [
  link('Dashboard', '/dashboard/cashier', LayoutDashboard, { exact: true }),
  link('POS', '/admin/billing', Store),
  link('Summary', '/cashier/executive-summary', ScrollText),
  link('Customers', '/admin/customers', Contact),
  link('Customer Ledger', '/admin/customer-ledger', BookUser),
  // Reports appear only when the owner grants them in Staff Permissions.
  group('reports', 'Reports', 'reports', ChartPie, [
    link('Attendance Reports', '/admin/hrm/reports', ClipboardList, { permission: 'attendance.view' }),
  ]),
  group('operations', 'Salon Operations', 'operations', Scissors, [
    link('Tokens / Queue', '/dashboard/cashier/tokens', ListTodo),
    link('Services', '/admin/products', Sparkles),
    link('Reminders', '/admin/reminders', MessageCircle),
  ]),
  group('crm', 'CRM & Growth', 'crm', HeartHandshake, [
    link('Appointments', '/admin/appointments', CalendarClock),
  ]),
  group('inventory', 'Inventory', 'inventory', Warehouse, [
    link('Products & Stock', '/admin/stock', Warehouse),
  ]),
  group('finance', 'Finance', 'finance', Wallet, [
    link('Opening & Closing', '/store/opening-closing', DoorOpen),
    link('Daily Expenses', '/dashboard/cashier/daily-expenses', Receipt),
    link('Savings', '/dashboard/cashier/savings', PiggyBank),
    link('Credit Collection', '/cashier/credit', Wallet),
  ]),
  group('hrm', 'HRM', 'hrm', Users, [
    link('My Attendance', '/attendance/my', UserCheck),
    // Shown only when the owner grants the permission in Staff Permissions.
    link('Attendance', '/admin/hrm/attendance', ClipboardCheck, { permission: 'attendance.view' }),
    link('Shifts & Roster', '/admin/hrm/shifts', Clock, { permission: 'shift.manage' }),
    link('Leave Management', '/admin/hrm/leave', CalendarOff, { permission: 'leave.view' }),
    link('Overtime', '/admin/hrm/overtime', Timer, { permission: 'overtime.view' }),
    link('Salary Advance', '/cashier/advances', Coins),
  ]),
];

const serviceStaffNav = (role) => [
  link('Dashboard', `/dashboard/${role}`, LayoutDashboard, { exact: true }),
  link('Queue', `/dashboard/${role}/queue`, ListTodo),
  link('My Appointments', '/appointments/my', CalendarClock),
  link('My Attendance', '/attendance/my', UserCheck),
];

export const NAVIGATION = {
  admin: ADMIN_NAV,
  cashier: CASHIER_NAV,
  barber: serviceStaffNav('barber'),
  stylist: serviceStaffNav('stylist'),
  beautician: serviceStaffNav('beautician'),
};

/**
 * A role's navigation. Links with a `permission` appear only when that delegated permission is
 * granted (admin sees everything); a group left with no links is dropped.
 */
export function navigationForRole(role, grants = null) {
  const entries = NAVIGATION[role] || NAVIGATION.stylist;
  const allowed = (item) => !item.permission || role === 'admin' || Boolean(grants?.[item.permission]);
  return entries
    .map((entry) => (entry.items ? { ...entry, items: entry.items.filter(allowed) } : entry))
    .filter((entry) => (entry.items ? entry.items.length > 0 : allowed(entry)));
}

/** Every link of a role's navigation, groups flattened. */
export function flattenNavigation(entries) {
  return entries.flatMap((entry) => (entry.items ? entry.items : [entry]));
}

/**
 * The one active href: the LONGEST link whose path is the current path or a parent of it,
 * so /dashboard/admin/expenses/salary lights "Salary & Payroll", not "Expenses".
 * `exact` links only match their own path.
 */
export function resolveActiveHref(entries, pathname) {
  if (!pathname) return null;
  const matches = flattenNavigation(entries).filter((item) => (
    pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`))
  ));
  if (!matches.length) return null;
  return matches.sort((a, b) => b.href.length - a.href.length)[0].href;
}
