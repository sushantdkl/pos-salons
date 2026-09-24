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
  PackagePlus, PackageSearch, PiggyBank, Printer, Receipt, ReceiptText, Scale, Scissors, ScrollText, SearchCheck,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Store, Ticket, Timer, TrendingUp, Truck, UserCheck, Users, Wallet, WalletCards, Warehouse,
} from 'lucide-react';

/**
 * Module family -> tint. Static literal Tailwind classes so the compiler keeps them.
 * bg: group band · header: label colour · active: active child row · bar: active marker ·
 * tile: the coloured square behind each icon.
 */
export const NAV_TINTS = {
  // Calm salon sidebar: each module group sits on its own muted tint (a soft wash of the colour
  // that represents it), icons in the same hue, and the active row is a white chip with a gold
  // marker. Muted on purpose — colour identifies the module without shouting.
  reports: { bg: 'bg-[#EFF1F8] ring-1 ring-[#E1E5F2]', header: 'text-[#3F4A7A]', hover: 'hover:bg-[#E5E9F5]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#D9DEEE]', bar: 'bg-[#B8913F]', icon: 'text-[#5B67A8]', tile: 'text-[#5B67A8]' },
  operations: { bg: 'bg-[#ECF5F3] ring-1 ring-[#DCEBE7]', header: 'text-[#2F6B61]', hover: 'hover:bg-[#E1EFEB]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#D2E6E0]', bar: 'bg-[#B8913F]', icon: 'text-[#3E8A7C]', tile: 'text-[#3E8A7C]' },
  crm: { bg: 'bg-[#F9EFF1] ring-1 ring-[#F0DFE3]', header: 'text-[#8A3F52]', hover: 'hover:bg-[#F4E4E8]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#EBD5DB]', bar: 'bg-[#B8913F]', icon: 'text-[#B0566E]', tile: 'text-[#B0566E]' },
  inventory: { bg: 'bg-[#F0F4EA] ring-1 ring-[#E2E9D8]', header: 'text-[#4F6B34]', hover: 'hover:bg-[#E6EDDD]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#D8E2CB]', bar: 'bg-[#B8913F]', icon: 'text-[#6A8C45]', tile: 'text-[#6A8C45]' },
  finance: { bg: 'bg-[#FAF3E6] ring-1 ring-[#F0E4CB]', header: 'text-[#80602A]', hover: 'hover:bg-[#F5EAD4]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#EBDDBE]', bar: 'bg-[#B8913F]', icon: 'text-[#A77C2E]', tile: 'text-[#A77C2E]' },
  hrm: { bg: 'bg-[#F3EFF8] ring-1 ring-[#E6DFF0]', header: 'text-[#5E4A86]', hover: 'hover:bg-[#EAE4F3]', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-[#DDD4EB]', bar: 'bg-[#B8913F]', icon: 'text-[#7A63A8]', tile: 'text-[#7A63A8]' },
  system: { bg: 'bg-stone-100 ring-1 ring-stone-200', header: 'text-stone-600', hover: 'hover:bg-stone-200/70', active: 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200', bar: 'bg-[#B8913F]', icon: 'text-stone-500', tile: 'text-stone-500' },
  top: { bg: '', header: 'text-stone-500', hover: 'hover:bg-stone-100', active: 'bg-[#F3EEE6] text-stone-900', bar: 'bg-[#B8913F]', icon: 'text-stone-500', tile: 'text-stone-500' },
};

const link = (label, href, icon, extra = {}) => ({ label, href, icon, ...extra });

/** Soft icon colours for main (top-level) links — each its own hue so the sidebar scans quickly. */
export const ICON_TILES = {
  sky: 'text-sky-600',
  emerald: 'text-emerald-600',
  indigo: 'text-indigo-500',
  amber: 'text-amber-600',
  rose: 'text-rose-500',
  fuchsia: 'text-fuchsia-500',
  orange: 'text-orange-500',
  cyan: 'text-cyan-600',
  blue: 'text-blue-500',
  teal: 'text-teal-600',
  slate: 'text-stone-500',
  violet: 'text-violet-500',
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
    link('Customer Credit', '/admin/reports/center/credit', HandCoins),
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
  link('Website CMS', '/dashboard/admin/website', Globe, { exact: true }),
  link('SEO & Local Search', '/dashboard/admin/website/seo', SearchCheck, { color: 'blue' }),
  link('Printer & Documents', '/admin/printer', Printer),
  link('Settings', '/admin/settings', Settings),
];

// Cashier: the operational items it had before, grouped, plus front-desk Appointments.
const CASHIER_NAV = [
  link('Dashboard', '/dashboard/cashier', LayoutDashboard, { exact: true }),
  link('POS', '/admin/billing', Store),
  link('Summary', '/cashier/executive-summary', ScrollText),
  link('Customers', '/admin/customers', Contact, { permission: 'customers.manage' }),
  link('Customer Ledger', '/admin/customer-ledger', BookUser),
  // Reports appear only when the owner grants them in Staff Permissions.
  group('reports', 'Reports', 'reports', ChartPie, [
    link('Attendance Reports', '/admin/hrm/reports', ClipboardList, { permission: 'attendance.view' }),
  ]),
  group('operations', 'Salon Operations', 'operations', Scissors, [
    link('Tokens / Queue', '/dashboard/cashier/tokens', ListTodo, { permission: 'tokens.manage' }),
    link('Services', '/admin/products', Sparkles),
    link('Reminders', '/admin/reminders', MessageCircle),
  ]),
  group('crm', 'CRM & Growth', 'crm', HeartHandshake, [
    link('Appointments', '/admin/appointments', CalendarClock, { permission: 'appointments.manage' }),
  ]),
  group('inventory', 'Inventory', 'inventory', Warehouse, [
    link('Products & Stock', '/admin/stock', Warehouse, { permission: 'stock.manage' }),
    link('Purchases', '/admin/purchases', PackagePlus, { permission: 'suppliers.manage' }),
    link('Suppliers', '/admin/suppliers', Truck, { permission: 'suppliers.manage' }),
    link('Supplier Ledger', '/admin/supplier-ledger', BookOpen, { permission: 'suppliers.manage' }),
  ]),
  group('finance', 'Finance', 'finance', Wallet, [
    link('Opening & Closing', '/store/opening-closing', DoorOpen),
    link('Daily Expenses', '/dashboard/cashier/daily-expenses', Receipt, { permission: 'expenses.daily' }),
    link('Savings', '/dashboard/cashier/savings', PiggyBank, { permission: 'savings.deposit' }),
    link('Credit Collection', '/cashier/credit', Wallet, { permission: 'billing.credit.create' }),
  ]),
  group('hrm', 'HRM', 'hrm', Users, [
    link('My Attendance', '/attendance/my', UserCheck),
    // Shown only when the owner grants the permission in Staff Permissions.
    link('Attendance', '/admin/hrm/attendance', ClipboardCheck, { permission: 'attendance.view' }),
    link('Shifts & Roster', '/admin/hrm/shifts', Clock, { permission: 'shift.manage' }),
    link('Leave Management', '/admin/hrm/leave', CalendarOff, { permission: 'leave.view' }),
    link('Overtime', '/admin/hrm/overtime', Timer, { permission: 'overtime.view' }),
    link('Salary Advance', '/cashier/advances', Coins, { permission: 'payroll.advances.create' }),
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
