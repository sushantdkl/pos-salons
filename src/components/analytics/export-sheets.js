/**
 * Salon Analytics as a coloured Excel workbook — every figure exactly as the server sent it.
 */
export function analyticsSheets(a, prev) {
  const k = a.kpis;
  const kpi = (label, key) => ({ label, value: k[key], previous: prev?.kpis?.[key] ?? null });
  return [
    {
      name: 'Summary',
      columns: [{ header: 'Measure', key: 'label', bold: true, width: 30 }, { header: 'This period', key: 'value', type: 'decimal', tone: 'ledger' }, { header: 'Previous period', key: 'previous', type: 'decimal' }],
      rows: [
        kpi('Gross sales', 'grossSales'), kpi('Discounts', 'discounts'), kpi('Voids processed', 'voids'), kpi('Net sales', 'netSales'),
        kpi('Operating expenses', 'expenses'), kpi('Salary / payroll paid', 'payroll'), kpi('Net collection', 'netCollection'),
        kpi('Completed bills', 'bills'), kpi('Customers served', 'customersServed'), kpi('Average bill', 'averageBill'),
        { label: 'Cash sales', value: a.payments.cash, previous: prev?.payments?.cash ?? null },
        { label: 'Online sales', value: a.payments.online, previous: prev?.payments?.online ?? null },
        { label: 'Credit billed', value: a.payments.credit, previous: prev?.payments?.credit ?? null },
      ],
    },
    {
      name: 'Daily trend',
      columns: [
        { header: 'Date', key: 'label' }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' },
        { header: 'Gross sales', key: 'grossSales', type: 'money' }, { header: 'Discounts', key: 'discounts', type: 'money', tone: 'outflow' },
        { header: 'Net sales', key: 'netSales', type: 'money', tone: 'inflow', bold: true },
        { header: 'Cash collected', key: 'cashCollected', type: 'money', tone: 'cash' }, { header: 'Online collected', key: 'qrCollected', type: 'money', tone: 'online' },
      ],
      rows: a.salesTrend,
    },
    {
      name: 'Services',
      columns: [
        { header: 'Service', key: 'name', bold: true }, { header: 'Category', key: 'category', type: 'status' },
        { header: 'Times done', key: 'quantity', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' },
        { header: 'Average value', key: 'averageValue', type: 'money', tone: 'ledger' },
      ],
      rows: a.services.byRevenue,
    },
    {
      name: 'Service categories',
      columns: [{ header: 'Category', key: 'category', bold: true }, { header: 'Quantity', key: 'quantity', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }, { header: 'Share', key: 'percentage', type: 'percent' }],
      rows: a.services.categories,
    },
    {
      name: 'Staff',
      columns: [
        { header: 'Staff', key: 'staffName', bold: true }, { header: 'Role', key: 'role', type: 'status' },
        { header: 'Services', key: 'servicesCompleted', type: 'number', tone: 'ops' }, { header: 'Customers', key: 'customersServed', type: 'number', tone: 'crm' },
        { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }, { header: 'Commission', key: 'commission', type: 'money', tone: 'hrm' },
        { header: 'Average ticket', key: 'averageTicket', type: 'money', tone: 'ledger' }, { header: 'Share', key: 'percentage', type: 'percent' },
      ],
      rows: a.staff,
    },
    {
      name: 'Top customers',
      columns: [{ header: 'Customer', key: 'name', bold: true }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' }, { header: 'Spend', key: 'spend', type: 'money', tone: 'crm' }],
      rows: a.customers.topCustomers,
    },
    {
      name: 'Products',
      columns: [{ header: 'Product', key: 'name', bold: true }, { header: 'Units sold', key: 'quantity', type: 'number', tone: 'ops' }, { header: 'Revenue', key: 'revenue', type: 'money', tone: 'inflow' }],
      rows: a.products.topProducts,
    },
    {
      name: 'Expenses',
      columns: [
        { header: 'Category', key: 'category', type: 'status' }, { header: 'Entries', key: 'records', type: 'number', tone: 'ledger' },
        { header: 'Cash', key: 'cash', type: 'money', tone: 'cash' }, { header: 'Online', key: 'online', type: 'money', tone: 'online' },
        { header: 'Amount', key: 'amount', type: 'money', tone: 'outflow', bold: true }, { header: 'Share', key: 'percentage', type: 'percent' },
      ],
      rows: a.expenses.categories,
    },
    {
      name: 'Sales by source',
      columns: [
        { header: 'Source', key: 'label', bold: true }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' },
        { header: 'Services done', key: 'services', type: 'number', tone: 'ops' }, { header: 'Sales before discount', key: 'gross', type: 'money' },
        { header: 'Billed total', key: 'total', type: 'money', tone: 'inflow', bold: true }, { header: 'Share', key: 'share', type: 'percent' },
      ],
      rows: a.sources,
      totals: { label: 'TOTAL', ...a.sourceTotals, share: 100 },
    },
    {
      name: 'Payment summary',
      columns: [{ header: 'Payment method', key: 'label', bold: true }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' }, { header: 'Amount', key: 'amount', type: 'money', tone: 'inflow' }],
      rows: [
        { label: 'Cash bills', bills: a.paymentSummary.cash.bills, amount: a.paymentSummary.cash.total },
        { label: 'Online / bank bills', bills: a.paymentSummary.online.bills, amount: a.paymentSummary.online.total },
        { label: 'Split payment bills', bills: a.paymentSummary.split.bills, amount: a.paymentSummary.split.total },
        { label: 'Credit collected in cash', bills: null, amount: a.money.payments.creditCollectionsCash },
        { label: 'Credit collected online', bills: null, amount: a.money.payments.creditCollectionsOnline },
      ],
      totals: { label: 'TOTAL MONEY RECEIVED', bills: a.paymentSummary.receivedBills, amount: a.money.totalReceived },
      note: `Sold on credit (not received): ${a.money.revenue.creditSales} across ${a.paymentSummary.credit.bills} bills.`,
    },
    {
      name: 'By hour',
      columns: [{ header: 'Hour', key: 'label' }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' }, { header: 'Billed value', key: 'total', type: 'money', tone: 'inflow' }],
      rows: a.byHour,
    },
    {
      name: 'By weekday',
      columns: [{ header: 'Day', key: 'label' }, { header: 'Bills', key: 'bills', type: 'number', tone: 'ledger' }, { header: 'Billed value', key: 'total', type: 'money', tone: 'inflow' }, { header: 'Average per day', key: 'average', type: 'money', tone: 'ops' }],
      rows: a.byWeekday,
    },
    {
      name: 'Voided bills',
      columns: [{ header: 'Bill', key: 'bill_number', bold: true }, { header: 'Customer', key: 'customer' }, { header: 'Reason', key: 'reason' }, { header: 'By', key: 'by_name' }, { header: 'Voided amount', key: 'amount', type: 'money', tone: 'outflow' }],
      rows: a.cancellations.voids,
      totals: { bill_number: 'TOTAL', amount: a.cancellations.totals.voidedAmount },
    },
  ];
}

