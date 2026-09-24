export const PERMISSION_ROLES = [
  { key: 'cashier', label: 'Cashier', description: 'Billing, customer service, collections, and daily counter operations.' },
  { key: 'barber', label: 'Barber', description: 'Barber workspace and assigned service operations.' },
  { key: 'stylist', label: 'Stylist', description: 'Stylist workspace and assigned service operations.' },
  { key: 'beautician', label: 'Beautician', description: 'Beauty workspace and assigned service operations.' },
];

export const PERMISSION_GROUPS = [
  {
    key: 'billing', label: 'Billing & customer credit', description: 'Invoices, settlement methods, customer credit, and corrections.',
    permissions: [
      { key: 'billing.create', label: 'Create bills', description: 'Finalize salon service and product invoices.' },
      { key: 'billing.credit.create', label: 'Issue and collect customer credit', description: 'Use customer credit within the configured limit and record collections.' },
      { key: 'billing.credit.override', label: 'Override customer credit limits', description: 'Exceed a customer limit with a recorded reason. Admin-sensitive.' },
      { key: 'billing.correct', label: 'Correct settled bills', description: 'Void a paid bill through an immutable correction and refund record.' },
    ],
  },
  {
    key: 'reports', label: 'Reports', description: 'Salon reporting center and comparison tools.',
    permissions: [
      { key: 'reports.view', label: 'View operational reports', description: 'Open permitted sales, service, product, payment, credit, and expense reports.' },
    ],
  },
  {
    key: 'advances', label: 'Salary advances', description: 'Least-privilege access to employee advance information and issuance.',
    permissions: [
      { key: 'payroll.view', label: 'View advance workspace', description: 'See employee identity and advance information required for an advance.' },
      { key: 'payroll.advances.create', label: 'Issue salary advances', description: 'Issue an advance within the configured cumulative payroll-period ceiling.' },
    ],
  },
  {
    key: 'hrm', label: 'HRM — attendance, shifts, leave & overtime', description: 'Workforce records. Employees always clock themselves in and out and see their own attendance.',
    permissions: [
      { key: 'attendance.view', label: 'View staff attendance', description: 'See all staff attendance, the calendar and attendance reports.' },
      { key: 'attendance.create', label: 'Clock staff in / out', description: 'Punch clock in, clock out and breaks on behalf of another employee.' },
      { key: 'attendance.edit', label: 'Enter manual attendance', description: 'Create an attendance record for a day with a reason.' },
      { key: 'attendance.correct', label: 'Correct attendance', description: 'Change punches or status of a past record, with a reason. Audited.' },
      { key: 'attendance.approve', label: 'Excuse late / approve early leave', description: 'Mark a late arrival excused or an early departure approved.' },
      { key: 'shift.manage', label: 'Manage shifts & rosters', description: 'Create shifts, assign staff, set day overrides and holidays.' },
      { key: 'leave.view', label: 'View all leave', description: 'See all staff leave requests and balances.' },
      { key: 'leave.request', label: 'Request own leave', description: 'Apply for leave for oneself.' },
      { key: 'leave.approve', label: 'Approve leave', description: 'Approve, reject or cancel leave, allocate leave balances.' },
      { key: 'overtime.view', label: 'View overtime', description: 'See potential and approved overtime for all staff.' },
      { key: 'overtime.approve', label: 'Approve overtime', description: 'Approve or reject overtime. Payroll only uses approved minutes.' },
    ],
  },
  {
    key: 'payroll', label: 'Full payroll — Admin-sensitive', description: 'Final salary payments and historical payroll corrections.',
    permissions: [
      { key: 'payroll.payments.create', label: 'Create full salary payments', description: 'Finalize a full payroll settlement. Blocked for Cashier by policy.' },
      { key: 'payroll.records.correct', label: 'Correct payroll records', description: 'Edit or reverse salary records. Blocked for Cashier by policy.' },
      { key: 'payroll.records.delete', label: 'Delete payroll records', description: 'Remove eligible payroll records. Blocked for Cashier by policy.' },
    ],
  },
];

export const PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key));

export const DEFAULT_ROLE_PERMISSIONS = {
  cashier: ['billing.create', 'billing.credit.create', 'reports.view', 'payroll.view', 'payroll.advances.create', 'leave.request'],
  barber: ['leave.request'], stylist: ['leave.request'], beautician: ['leave.request'],
};
