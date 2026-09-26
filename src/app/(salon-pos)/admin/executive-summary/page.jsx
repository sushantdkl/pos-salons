'use client';

import SummaryReport from '@/components/reports/summary-report';

/** Admin Summary report — the admin payload from /api/admin/executive-summary. */
export default function AdminSummaryPage() {
  return <SummaryReport scope="admin" />;
}
