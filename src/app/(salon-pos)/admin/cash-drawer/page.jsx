'use client';

import { ArrowDownUp } from 'lucide-react';
import { ErpPage, PageHeader } from '@/components/erp';
import MovementWorkspace from '@/components/cash/movement-workspace';

export default function CashDrawerPage() {
  return (
    <ErpPage>
      <PageHeader
        icon={ArrowDownUp}
        iconTone="cash"
        title="Cash In / Out"
        subtitle="Owner adds or takes cash, bank deposits and withdrawals, money to or from the safe. Not a sale or an expense — it only changes business cash and Expected Cash in Drawer."
      />
      <MovementWorkspace kind="cash" />
    </ErpPage>
  );
}
