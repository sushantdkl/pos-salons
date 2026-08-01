'use client';

import SavingsManager from '@/modules/savings/components/savings-manager';

export default function CashierSavingsPage() {
  return (
    <SavingsManager
      title="Savings & Deposits"
      description="Record same-day bank or Sahakari deposits you handled at the front desk. These reduce cash in hand but are not expenses."
    />
  );
}
