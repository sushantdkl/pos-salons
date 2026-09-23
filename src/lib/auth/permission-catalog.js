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
  cashier: ['billing.create', 'billing.credit.create', 'reports.view', 'payroll.view', 'payroll.advances.create'],
  barber: [], stylist: [], beautician: [],
};
