'use client';

/** SUPPLIER LEDGER — what the salon owes each supplier, for how long, and their statement. */

import { LedgerOverview } from '@/components/ledgers/ledger-overview';

export default function SupplierLedgerPage() {
  return (
    <LedgerOverview
      kind="supplier"
      accent="orange"
      title="Supplier Ledger"
      subtitle="Manage supplier statements and payments: what you owe, since when, and every purchase and payment."
    />
  );
}
