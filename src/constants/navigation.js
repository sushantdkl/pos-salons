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
  BadgeDollarSign, Banknote, CalendarDays, ChartColumnBig, ChartPie, Coins, Contact, DoorOpen,
  GitCompareArrows, Globe, HandCoins, LayoutDashboard, ListOrdered, ListTodo, MessageCircle,
  PackageSearch, PiggyBank, Printer, Receipt, ReceiptText, Scale, Scissors, ScrollText,
  Settings, ShieldCheck, Sparkles, Store, Ticket, TrendingUp, Users, Wallet, WalletCards, Warehouse,
} from 'lucide-react';

/**
 * Module family -> tint. Static literal Tailwind classes so the compiler keeps them.
 * bg: group band · header: label colour · active: active child row · bar: active marker.
 */
export const NAV_TINTS = {
  reports: { bg: 'bg-indigo-50', header: 'text-indigo-800', hover: 'hover:bg-indigo-100', active: 'bg-indigo-100 text-indigo-950', bar: 'bg-indigo-600', icon: 'text-indigo-600' },
  operations: { bg: 'bg-teal-50', header: 'text-teal-800', hover: 'hover:bg-teal-100', active: 'bg-teal-100 text-teal-950', bar: 'bg-teal-600', icon: 'text-teal-600' },
  inventory: { bg: 'bg-lime-50', header: 'text-lime-800', hover: 'hover:bg-lime-100', active: 'bg-lime-100 text-lime-950', bar: 'bg-lime-600', icon: 'text-lime-700' },
  finance: { bg: 'bg-amber-50', header: 'text-amber-800', hover: 'hover:bg-amber-100', active: 'bg-amber-100 text-amber-950', bar: 'bg-amber-600', icon: 'text-amber-600' },
  hrm: { bg: 'bg-violet-50', header: 'text-violet-800', hover: 'hover:bg-violet-100', active: 'bg-violet-100 text-violet-950', bar: 'bg-violet-600', icon: 'text-violet-600' },
  system: { bg: 'bg-stone-100', header: 'text-stone-700', hover: 'hover:bg-stone-200', active: 'bg-stone-200 text-stone-950', bar: 'bg-stone-600', icon: 'text-stone-500' },
  top: { bg: '', header: 'text-stone-700', hover: 'hover:bg-stone-100', active: 'bg-stone-900 text-white', bar: 'bg-stone-900', icon: 'text-stone-600' },
};

const link = (label, href, icon, extra = {}) => ({ label, href, icon, ...extra });
const group = (id, label, tint, icon, items) => ({ id, label, tint, icon, items });

const ADMIN_NAV = [
  link('Dashboard', '/dashboard/admin', LayoutDashboard, { exact: true }),
  link('POS', '/admin/billing', Store),
  link('Analytics', '/admin/analytics', ChartColumnBig),
  link('Summary', '/admin/executive-summary', ScrollText),
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
    link('Compare Periods', '/admin/reports/compare', GitCompareArrows),
  ]),
  group('operations', 'Salon Operations', 'operations', Scissors, [
    link('Tokens / Queue', '/dashboard/admin/tokens', ListTodo),
    link('Services', '/admin/products', Sparkles),
    link('Customers', '/admin/customers', Contact),
    link('Reminders', '/admin/reminders', MessageCircle),
  ]),
  group('inventory', 'Inventory', 'inventory', Warehouse, [
    link('Products & Stock', '/admin/stock', Warehouse),
  ]),
  group('finance', 'Finance', 'finance', Wallet, [
    link('Opening & Closing', '/store/opening-closing', DoorOpen),
    link('Business Day History', '/dashboard/admin/business-days', CalendarDays),
    link('Expenses', '/dashboard/admin/expenses', Receipt),
    link('Savings', '/admin/savings', PiggyBank),
    link('Credit Collection', '/cashier/credit', Wallet),
  ]),
  group('hrm', 'HRM', 'hrm', Users, [
    link('Staff', '/admin/employees', Users),
    link('Salary & Payroll', '/dashboard/admin/expenses/salary', Banknote),
    link('Salary Advances', '/cashier/advances', Coins),
    link('Advances Report', '/admin/reports/center/advances', Scale),
    link('Staff Performance', '/dashboard/admin/staff-performance', TrendingUp),
    link('Staff Permissions', '/admin/permissions', ShieldCheck),
  ]),
  group('system', 'System', 'system', Settings, [
    link('Website CMS', '/dashboard/admin/website', Globe),
    link('Printer', '/admin/printer', Printer),
    link('Settings', '/admin/settings', Settings),
  ]),
];

// Cashier keeps exactly the items it had before the redesign — only grouped.
const CASHIER_NAV = [
  link('Dashboard', '/dashboard/cashier', LayoutDashboard, { exact: true }),
  link('POS', '/admin/billing', Store),
  link('Summary', '/cashier/executive-summary', ScrollText),
  group('operations', 'Salon Operations', 'operations', Scissors, [
    link('Tokens / Queue', '/dashboard/cashier/tokens', ListTodo),
    link('Services', '/admin/products', Sparkles),
    link('Customers', '/admin/customers', Contact),
    link('Reminders', '/admin/reminders', MessageCircle),
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
    link('Salary Advance', '/cashier/advances', Coins),
  ]),
];

const serviceStaffNav = (role) => [
  link('Dashboard', `/dashboard/${role}`, LayoutDashboard, { exact: true }),
  link('Queue', `/dashboard/${role}/queue`, ListTodo),
];

export const NAVIGATION = {
  admin: ADMIN_NAV,
  cashier: CASHIER_NAV,
  barber: serviceStaffNav('barber'),
  stylist: serviceStaffNav('stylist'),
  beautician: serviceStaffNav('beautician'),
};

export function navigationForRole(role) {
  return NAVIGATION[role] || NAVIGATION.stylist;
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
