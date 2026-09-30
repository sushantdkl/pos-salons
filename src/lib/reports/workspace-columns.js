/**
 * Column specs for the report workspace tables, per report → table key.
 * type: date | datetime | bill | customer | text | status | money | number | percent
 * tone: ERP colour for money columns (header tint in Excel, text colour on screen).
 */
const date = { key: 'date', label: 'Date', type: 'date' };
const share = { key: 'share', label: 'Share', type: 'percent' };

const DAILY_SALES = [
  date,
  { key: 'bills', label: 'Bills', type: 'number', tone: 'ledger' },
  { key: 'gross', label: 'Gross', type: 'money' },
  { key: 'discount', label: 'Discount', type: 'money', tone: 'outflow' },
  { key: 'cash', label: 'Cash', type: 'money', tone: 'cash' },
  { key: 'online', label: 'Online', type: 'money', tone: 'online' },
  { key: 'credit', label: 'Credit', type: 'money', tone: 'ledger' },
  { key: 'amount', label: 'Net sales', type: 'money', tone: 'inflow', strong: true },
];

const itemTables = (noun) => ({
  items: [
    { key: 'name', label: noun, type: 'text', strong: true },
    { key: 'category', label: 'Category', type: 'status' },
    { key: 'quantity', label: noun === 'Service' ? 'Times done' : 'Units sold', type: 'number', tone: 'ops' },
    { key: 'revenue', label: 'Revenue', type: 'money', tone: 'inflow', strong: true },
    { key: 'commission', label: 'Commission', type: 'money', tone: 'hrm' },
    { key: 'cost', label: 'Direct cost', type: 'money', tone: 'outflow' },
    { key: 'profit', label: 'Profit after cost & commission', type: 'money', tone: 'ledger' },
    share,
  ],
  staff: [
    { key: 'staff', label: 'Staff', type: 'text', strong: true },
    { key: 'quantity', label: noun === 'Service' ? 'Services' : 'Units', type: 'number', tone: 'ops' },
    { key: 'revenue', label: 'Revenue', type: 'money', tone: 'inflow', strong: true },
    { key: 'commission', label: 'Commission', type: 'money', tone: 'hrm' },
    share,
  ],
  categories: [
    { key: 'category', label: 'Category', type: 'text', strong: true },
    { key: 'quantity', label: 'Quantity', type: 'number', tone: 'ops' },
    { key: 'amount', label: 'Revenue', type: 'money', tone: 'inflow', strong: true },
    share,
  ],
  daily: [
    date,
    { key: noun === 'Service' ? 'services' : 'units', label: noun === 'Service' ? 'Services' : 'Units', type: 'number', tone: 'ops' },
    { key: 'revenue', label: 'Revenue', type: 'money', tone: 'inflow', strong: true },
    { key: 'commission', label: 'Commission', type: 'money', tone: 'hrm' },
    { key: 'cost', label: 'Direct cost', type: 'money', tone: 'outflow' },
  ],
});

export const WORKSPACE_COLUMNS = {
  sales: {
    invoices: [
      { key: 'time', label: 'Date', type: 'datetime' },
      { key: 'bill_number', label: 'Invoice', type: 'bill', idKey: 'id' },
      { key: 'customer', label: 'Customer', type: 'text', subKey: 'phone' },
      { key: 'staff', label: 'Staff', type: 'text', muted: true },
      { key: 'method', label: 'Payment', type: 'status' },
      { key: 'discount', label: 'Discount', type: 'money', tone: 'outflow' },
      // Shown as the Cash / Online / Credit split in the TOTAL row; full columns in Excel/CSV.
      { key: 'cash', label: 'Cash', type: 'money', tone: 'cash', exportOnly: true },
      { key: 'online', label: 'Online', type: 'money', tone: 'online', exportOnly: true },
      { key: 'credit', label: 'Credit', type: 'money', tone: 'ledger', exportOnly: true },
      { key: 'total', label: 'Final total', type: 'money', tone: 'inflow', strong: true },
    ],
    methods: [
      { key: 'method', label: 'Payment method', type: 'status' },
      { key: 'transactions', label: 'Transactions', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'inflow', strong: true },
      share,
    ],
    categories: [
      { key: 'type', label: 'Type', type: 'status' },
      { key: 'category', label: 'Category', type: 'text', strong: true },
      { key: 'quantity', label: 'Quantity', type: 'number', tone: 'ops' },
      { key: 'amount', label: 'Amount (before bill discount)', type: 'money', tone: 'inflow', strong: true },
      share,
    ],
    daily: DAILY_SALES,
  },
  services: itemTables('Service'),
  products: itemTables('Product'),
  payments: {
    methods: [
      { key: 'method', label: 'Method', type: 'status' },
      { key: 'provider', label: 'Provider', type: 'status' },
      { key: 'transactions', label: 'Payments', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'inflow', strong: true },
      share,
    ],
    daily: [
      date,
      { key: 'cash', label: 'Cash', type: 'money', tone: 'cash' },
      { key: 'online', label: 'Online', type: 'money', tone: 'online' },
      { key: 'credit', label: 'Credit', type: 'money', tone: 'ledger' },
      { key: 'amount', label: 'Total settled', type: 'money', tone: 'inflow', strong: true },
    ],
    lines: [
      { key: 'time', label: 'Date', type: 'datetime' },
      { key: 'bill_number', label: 'Invoice', type: 'bill', idKey: 'bill_id' },
      { key: 'customer', label: 'Customer', type: 'text' },
      { key: 'method', label: 'Method', type: 'status' },
      { key: 'provider', label: 'Provider', type: 'status' },
      { key: 'reference', label: 'Reference', type: 'text', muted: true },
      { key: 'change', label: 'Change given', type: 'money', tone: 'cash' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'inflow', strong: true },
    ],
  },
  credit: {
    entries: [
      { key: 'time', label: 'Date', type: 'datetime' },
      { key: 'customer', label: 'Customer', type: 'customer', idKey: 'customer_id', subKey: 'phone' },
      { key: 'entry', label: 'Entry', type: 'status' },
      { key: 'bill_number', label: 'Invoice', type: 'bill', idKey: 'bill_id' },
      { key: 'note', label: 'Note', type: 'text', muted: true },
      { key: 'given', label: 'Credit given', type: 'money', tone: 'outflow' },
      { key: 'collected', label: 'Collected', type: 'money', tone: 'inflow' },
    ],
    customers: [
      { key: 'customer', label: 'Customer', type: 'customer', idKey: 'customer_id', subKey: 'phone' },
      { key: 'given', label: 'Given this period', type: 'money', tone: 'outflow' },
      { key: 'collected', label: 'Collected this period', type: 'money', tone: 'inflow' },
      { key: 'outstanding', label: 'Outstanding now', type: 'money', tone: 'ledger', strong: true },
    ],
  },
  expenses: {
    ledger: [
      date,
      { key: 'title', label: 'Expense', type: 'text', strong: true, opens: 'expense', idKey: 'id' },
      { key: 'category', label: 'Category', type: 'status' },
      { key: 'paid_to', label: 'Payee', type: 'text' },
      { key: 'method', label: 'Paid by', type: 'status' },
      { key: 'reference', label: 'Receipt / ref.', type: 'text', muted: true },
      { key: 'cash', label: 'Cash', type: 'money', tone: 'cash' },
      { key: 'online', label: 'Online', type: 'money', tone: 'online' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'outflow', strong: true },
    ],
    categories: [
      { key: 'category', label: 'Category', type: 'status' },
      { key: 'count', label: 'Entries', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'outflow', strong: true },
      share,
    ],
    methods: [
      { key: 'method', label: 'Paid by', type: 'status' },
      { key: 'count', label: 'Entries', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'outflow', strong: true },
      share,
    ],
    daily: [
      date,
      { key: 'count', label: 'Entries', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Amount', type: 'money', tone: 'outflow', strong: true },
    ],
  },
  advances: {
    advances: [
      date,
      { key: 'employee', label: 'Employee', type: 'text', strong: true, opens: 'expense', idKey: 'expense_id' },
      { key: 'basis', label: 'Against', type: 'status' },
      { key: 'method', label: 'Paid by', type: 'status' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'reference', label: 'Reference', type: 'text', muted: true },
      { key: 'amount', label: 'Advance', type: 'money', tone: 'hrm', strong: true },
      { key: 'recovered', label: 'Recovered', type: 'money', tone: 'inflow' },
      { key: 'outstanding', label: 'Outstanding', type: 'money', tone: 'outflow' },
    ],
    employees: [
      { key: 'employee', label: 'Employee', type: 'text', strong: true },
      { key: 'count', label: 'Advances', type: 'number', tone: 'ledger' },
      { key: 'amount', label: 'Issued', type: 'money', tone: 'hrm', strong: true },
      { key: 'recovered', label: 'Recovered', type: 'money', tone: 'inflow' },
      { key: 'outstanding', label: 'Outstanding', type: 'money', tone: 'outflow' },
    ],
  },
};

/** KPI cards per workspace report (keys come from lib/reports/workspace.js metrics). */
export const WORKSPACE_METRICS = {
  finalized_total: { label: 'Net sales', type: 'money', tone: 'inflow', emphasis: true },
  invoices: { label: 'Bills', type: 'number', tone: 'ledger' },
  average_bill: { label: 'Average bill', type: 'money', tone: 'ops' },
  discounts: { label: 'Discounts', type: 'money', tone: 'outflow', lowerIsBetter: true },
  cash_received: { label: 'Cash', type: 'money', tone: 'cash' },
  online_received: { label: 'Online', type: 'money', tone: 'online' },
  credit_issued: { label: 'Given on credit', type: 'money', tone: 'ledger', lowerIsBetter: true },
  revenue: { label: 'Revenue', type: 'money', tone: 'inflow', emphasis: true },
  quantity: { label: 'Quantity', type: 'number', tone: 'ops' },
  commission: { label: 'Commission', type: 'money', tone: 'hrm' },
  cost: { label: 'Direct cost', type: 'money', tone: 'outflow', lowerIsBetter: true },
  gross_profit: { label: 'Profit after cost & commission', type: 'money', tone: 'ledger', emphasis: true },
  settled: { label: 'Total settled', type: 'money', tone: 'inflow', emphasis: true },
  transactions: { label: 'Payments', type: 'number', tone: 'ledger' },
  credit_given: { label: 'Credit given', type: 'money', tone: 'outflow', lowerIsBetter: true },
  credit_collected: { label: 'Credit collected', type: 'money', tone: 'inflow' },
  outstanding: { label: 'Outstanding', type: 'money', tone: 'ledger', lowerIsBetter: true },
  expenses: { label: 'Operating expenses', type: 'money', tone: 'outflow', emphasis: true, lowerIsBetter: true },
  expense_count: { label: 'Entries', type: 'number', tone: 'ledger' },
  cash_paid: { label: 'Paid in cash', type: 'money', tone: 'cash' },
  online_paid: { label: 'Paid online', type: 'money', tone: 'online' },
  issued: { label: 'Advances issued', type: 'money', tone: 'hrm', emphasis: true },
  recovered: { label: 'Recovered', type: 'money', tone: 'inflow' },
};

/** Balances "as of now" — no period comparison. */
export const WORKSPACE_SNAPSHOT = { credit: ['outstanding'] };
