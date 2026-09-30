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
      { key: 'billing.payment_method.change', label: 'Change payment method', description: 'Fix a wrong cash / online choice on a bill from the open session. A reason is required and kept.' },
      { key: 'billing.correct', label: 'Cancel (void) settled bills', description: 'Void a paid bill through an immutable correction and refund record. A reason is required.' },
    ],
  },
  {
    key: 'frontdesk', label: 'Front desk & customers', description: 'Queue tokens, appointments, customers, services and reminders.',
    permissions: [
      { key: 'tokens.manage', label: 'Manage queue tokens', description: 'Issue, cancel and mark tokens no-show; token report.' },
      { key: 'appointments.manage', label: 'Manage appointments', description: 'Book, confirm, check in, reschedule and cancel appointments; manage the waitlist.' },
      { key: 'appointments.settings', label: 'Change hours & online booking', description: 'Staff working hours, days off, time off and online booking settings (Hours & Booking).' },
      { key: 'customers.manage', label: 'Add and edit customers', description: 'Create, edit and delete customer records. (Picking a customer while billing needs only “Create bills”.)' },
      { key: 'services.manage', label: 'Edit services & prices', description: 'Add, edit, archive services and change their prices (Services). Billing always uses the current price list.' },
      { key: 'reminders.send', label: 'Send customer reminders', description: 'Open Reminders and message customers about visits and dues.' },
    ],
  },
  {
    key: 'cash', label: 'Daily cash — expenses, savings & cash in / out', description: 'Money coming into or leaving the drawer during the day.',
    permissions: [
      { key: 'expenses.daily', label: 'Record daily expenses', description: 'Tea, water, cleaning and other petty expenses from the drawer.' },
      { key: 'savings.deposit', label: 'Record savings deposits', description: 'Move cash or online money to a bank / sahakari deposit.' },
      { key: 'cash.movements', label: 'Cash In / Cash Out', description: 'Add cash to or take cash out of the drawer (owner, bank, safe). Not a sale or an expense. A note is always required.' },
      { key: 'cash.exchange', label: 'Cash exchange', description: 'Swap a customer’s online payment for cash, or cash for online, with an optional charge.' },
    ],
  },
  {
    key: 'inventory', label: 'Inventory & suppliers', description: 'Products, stock and buying from suppliers.',
    permissions: [
      { key: 'stock.manage', label: 'Manage products & stock', description: 'Add products and adjust stock. (Selling products needs only “Create bills”.)' },
      { key: 'suppliers.manage', label: 'Suppliers & purchases', description: 'Suppliers, purchases received, supplier payments and the supplier ledger. Admin-sensitive.' },
    ],
  },
  {
    key: 'reports', label: 'Reports', description: 'Reports, analytics and business history. Each item below is one entry in the Reports menu.',
    permissions: [
      { key: 'reports.view', label: 'Sales, service & money reports', description: 'Sales & Invoices, Services, Products, Payment Reconciliation, Customer Credit, Expenses, Transactions and Compare Periods.' },
      { key: 'reports.overview', label: 'Business overview', description: 'The Business Overview report: sales, payments and expenses at a glance.' },
      { key: 'reports.business_days', label: 'Business day history', description: 'Every business day and session: floats, expected and counted cash, differences.' },
      { key: 'reports.staff', label: 'Staff performance — Admin-sensitive', description: 'Revenue, services and commission per team member.' },
      { key: 'reports.analytics', label: 'Salon analytics — Admin-sensitive', description: 'The full Analytics dashboard, including payroll, commission and profit figures.' },
      { key: 'reports.sensitive', label: 'Show commission, cost & profit in reports — Admin-sensitive', description: 'Without this, reports hide commission, product cost and profit columns.' },
    ],
  },
  {
    key: 'advances', label: 'Salary advances', description: 'Least-privilege access to employee advance information and issuance.',
    permissions: [
      { key: 'payroll.view', label: 'View advance workspace', description: 'See employee identity and advance information required for an advance.' },
      { key: 'payroll.advances.create', label: 'Issue salary advances', description: 'Issue an advance within the configured cumulative payroll-period ceiling.' },
      { key: 'reports.advances', label: 'Advances report — Admin-sensitive', description: 'The Advances Report: every advance given, applied and still outstanding per employee.' },
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
    key: 'crm', label: 'CRM — loyalty & customer reviews', description: 'Loyalty cards and customer feedback. Applying a reward at the POS only needs billing.',
    permissions: [
      { key: 'loyalty.view', label: 'View loyalty', description: 'See loyalty programs, customer progress and the loyalty ledger.' },
      { key: 'loyalty.adjust', label: 'Adjust loyalty visits', description: 'Add or remove visits with a reason. Audited.' },
      { key: 'loyalty.manage', label: 'Manage loyalty programs', description: 'Create and change loyalty programs.' },
      { key: 'reviews.view', label: 'View customer reviews', description: 'Read feedback, ratings and review analytics.' },
      { key: 'reviews.moderate', label: 'Moderate reviews', description: 'Publish, keep private, reject, archive or re-open reviews.' },
      { key: 'reviews.manage', label: 'Manage feedback forms & QR', description: 'Build feedback forms and change review & rewards settings.' },
    ],
  },
  {
    key: 'website', label: 'Website & printed documents', description: 'The public website and what the salon prints.',
    permissions: [
      { key: 'website.manage', label: 'Edit website & SEO', description: 'Website CMS (pages, gallery, offers) and SEO & Local Search.' },
      { key: 'documents.manage', label: 'Printer & documents', description: 'Receipt, credit statement and Review QR sheet layout and wording.' },
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

/**
 * Two levels: every group is a MODULE (module.<group>) that must be switched on before any
 * permission inside it counts. Switching a module off blocks everything in it.
 */
export const moduleKeyFor = (groupKey) => `module.${groupKey}`;
export const MODULE_KEYS = PERMISSION_GROUPS.map((group) => moduleKeyFor(group.key));
export const PERMISSION_MODULE = Object.fromEntries(PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => [permission.key, moduleKeyFor(group.key)])));
export const ALL_PERMISSION_KEYS = [...MODULE_KEYS, ...PERMISSION_KEYS];

export const DEFAULT_ROLE_PERMISSIONS = {
  cashier: ['billing.create', 'billing.credit.create', 'billing.payment_method.change', 'reports.view', 'payroll.view', 'payroll.advances.create', 'leave.request',
    'tokens.manage', 'appointments.manage', 'customers.manage', 'services.manage', 'reminders.send', 'expenses.daily', 'savings.deposit', 'stock.manage'],
  barber: ['leave.request'], stylist: ['leave.request'], beautician: ['leave.request'],
};

/** A role's defaults including the modules those defaults live in. */
export function defaultGrants(role) {
  const permissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return new Set([...permissions, ...permissions.map((key) => PERMISSION_MODULE[key])]);
}
