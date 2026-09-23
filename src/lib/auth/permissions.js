import { requireAuth } from '@/lib/salon-schema';

export const PERMISSIONS = Object.freeze({
  BILLING_CREATE: 'billing.create',
  BILLING_CREDIT_CREATE: 'billing.credit.create',
  BILLING_CREDIT_OVERRIDE: 'billing.credit.override',
  BILLING_CORRECT: 'billing.correct',
  REPORTS_VIEW: 'reports.view',
  PAYROLL_VIEW: 'payroll.view',
  ADVANCES_CREATE: 'payroll.advances.create',
  PAYROLL_PAYMENTS_CREATE: 'payroll.payments.create',
  PAYROLL_RECORDS_CORRECT: 'payroll.records.correct',
  PAYROLL_RECORDS_DELETE: 'payroll.records.delete',
});

export async function hasPermission(db, user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const row = await db.get(
    'SELECT allowed FROM role_permissions WHERE role = ? AND permission_key = ?',
    [user.role, permission]
  );
  return row?.allowed === true;
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
