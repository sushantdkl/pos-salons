'use client';

import SummaryReport from '@/components/reports/summary-report';

/** Cashier Summary report — the cashier payload from /api/cashier/executive-summary. */
export default function CashierSummaryPage() {
  return <SummaryReport scope="cashier" />;
}
