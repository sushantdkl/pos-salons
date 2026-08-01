'use client';

import SavingsManager from '@/modules/savings/components/savings-manager';

export default function AdminSavingsPage() {
  return (
    <SavingsManager
      title="Savings & Deposits"
      description="Bank and Sahakari deposits recorded across the salon. These are internal fund transfers, never operating expenses."
    />
  );
}
