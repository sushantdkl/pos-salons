import { requireAuth } from '@/lib/salon-schema';
import { PERMISSION_MODULE } from '@/lib/auth/permission-catalog';

export const PERMISSIONS = Object.freeze({
  BILLING_CREATE: 'billing.create',
  BILLING_CREDIT_CREATE: 'billing.credit.create',
  BILLING_CREDIT_OVERRIDE: 'billing.credit.override',
  BILLING_CORRECT: 'billing.correct',
  BILLING_PAYMENT_METHOD_CHANGE: 'billing.payment_method.change',
  REPORTS_VIEW: 'reports.view',
  REPORTS_OVERVIEW: 'reports.overview',
  REPORTS_BUSINESS_DAYS: 'reports.business_days',
  REPORTS_STAFF: 'reports.staff',
  REPORTS_ANALYTICS: 'reports.analytics',
  REPORTS_SENSITIVE: 'reports.sensitive',
  REPORTS_ADVANCES: 'reports.advances',
  APPOINTMENTS_SETTINGS: 'appointments.settings',
  SERVICES_MANAGE: 'services.manage',
  REMINDERS_SEND: 'reminders.send',
  WEBSITE_MANAGE: 'website.manage',
  DOCUMENTS_MANAGE: 'documents.manage',
  PAYROLL_VIEW: 'payroll.view',
  ADVANCES_CREATE: 'payroll.advances.create',
  PAYROLL_PAYMENTS_CREATE: 'payroll.payments.create',
  PAYROLL_RECORDS_CORRECT: 'payroll.records.correct',
  PAYROLL_RECORDS_DELETE: 'payroll.records.delete',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_CREATE: 'attendance.create',
  ATTENDANCE_EDIT: 'attendance.edit',
  ATTENDANCE_CORRECT: 'attendance.correct',
  ATTENDANCE_APPROVE: 'attendance.approve',
  SHIFT_MANAGE: 'shift.manage',
  LEAVE_VIEW: 'leave.view',
  LEAVE_REQUEST: 'leave.request',
  LEAVE_APPROVE: 'leave.approve',
  OVERTIME_VIEW: 'overtime.view',
  OVERTIME_APPROVE: 'overtime.approve',
  LOYALTY_VIEW: 'loyalty.view',
  LOYALTY_ADJUST: 'loyalty.adjust',
  LOYALTY_MANAGE: 'loyalty.manage',
  REVIEWS_VIEW: 'reviews.view',
  REVIEWS_MODERATE: 'reviews.moderate',
  REVIEWS_MANAGE: 'reviews.manage',
  TOKENS_MANAGE: 'tokens.manage',
  APPOINTMENTS_MANAGE: 'appointments.manage',
  CUSTOMERS_MANAGE: 'customers.manage',
  EXPENSES_DAILY: 'expenses.daily',
  SAVINGS_DEPOSIT: 'savings.deposit',
  STOCK_MANAGE: 'stock.manage',
  SUPPLIERS_MANAGE: 'suppliers.manage',
});

/**
 * A permission counts only when it AND its module (module.<group>) are allowed for the role —
 * switching a module off in Staff Permissions blocks everything inside it.
 */
export async function hasPermission(db, user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const moduleKey = PERMISSION_MODULE[permission];
  const keys = moduleKey ? [permission, moduleKey] : [permission];
  const rows = await db.all(
    `SELECT permission_key, allowed FROM role_permissions WHERE role = ? AND permission_key IN (${keys.map(() => '?').join(',')})`,
    [user.role, ...keys]
  );
  return keys.every((key) => rows.some((row) => row.permission_key === key && row.allowed === true));
}

export async function requirePermission(request, db, permission) {
  const user = await requireAuth(request, db);
  if (!(await hasPermission(db, user, permission))) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  return user;
}

/**
 * Role gate + delegated permission: the user must have one of `roles`, and (unless admin) the
 * permission must be allowed for their role in Staff Permissions (module on + permission on).
 */
export async function requireRoleWithPermission(request, db, roles, permission) {
  const user = await requireAuth(request, db);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role) || !(await hasPermission(db, user, permission))) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  return user;
}

/** For a user already authenticated: throws 403 unless the permission applies. */
export async function assertPermission(db, user, permission) {
  if (!(await hasPermission(db, user, permission))) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
}
