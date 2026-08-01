'use client';

import { Suspense } from 'react';
import TransactionReport from '@/modules/reports/components/transaction-report';

export default function AdminTransactionReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 p-6 text-sm text-gray-600">Loading transaction report…</div>}>
      <TransactionReport
        basePath="/admin/reports/transactions"
        backPath="/admin/dashboard"
        title="Transaction Report"
      />
    </Suspense>
  );
}
