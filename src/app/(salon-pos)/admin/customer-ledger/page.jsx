'use client';

/** CUSTOMER LEDGER — who owes the salon on a credit account, for how long, and their statement. */

import { LedgerOverview } from '@/components/ledgers/ledger-overview';

export default function CustomerLedgerPage() {
  return (
    <LedgerOverview
      kind="customer"
      accent="rose"
      title="Customer Ledger"
      subtitle="Who owes you on a named credit account, how long it has been outstanding, and what they have paid."
    />
  );
}
