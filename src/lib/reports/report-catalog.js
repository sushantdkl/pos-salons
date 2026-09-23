export const REPORT_CATALOG = Object.freeze({
  sales: {
    title: 'Sales & Invoices',
    description: 'See finalized salon bills, billed value, discounts, tax, and settlement status.',
    question: 'What did the salon bill and collect during this period?',
  },
  services: {
    title: 'Services Report',
    description: 'Rank completed salon services by quantity, revenue, direct cost, and commission.',
    question: 'Which services generated the most activity and revenue?',
  },
  products: {
    title: 'Products & Retail',
    description: 'Review retail product quantity, revenue, direct cost, and commission.',
    question: 'Which retail products contributed to sales?',
  },
  payments: {
    title: 'Payment Reconciliation',
    description: 'Reconcile Cash, Online, and Credit allocations without losing provider detail.',
    question: 'How was billed value settled?',
  },
  credit: {
    title: 'Customer Credit',
    description: 'Review credit issued, collections, source bills, and the current outstanding balance.',
    question: 'Which customer credit movements changed the receivable balance?',
  },
  expenses: {
    title: 'Expenses Report',
    description: 'Inspect active expenses by expense date, category, payment method, and recipient.',
    question: 'What operating expenses were recorded during this period?',
  },
  advances: {
    title: 'Salary Advances',
    description: 'Admin-only view of issued advances, recovered amounts, and outstanding balances.',
    question: 'What salary advances were issued and remain recoverable?',
  },
});

export const MONEY_FIELDS = new Set([
  'gross_billed', 'discounts', 'tax', 'finalized_total', 'voids', 'revenue_after_voids', 'cash_received', 'online_received',
  'credit_issued', 'revenue', 'commission', 'cost', 'amount', 'change', 'outstanding', 'debit',
  'credit', 'expenses', 'issued', 'applied_amount', 'grand_total', 'total_paid', 'credit_amount',
]);

export function humanizeReportField(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
