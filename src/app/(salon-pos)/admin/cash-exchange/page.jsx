'use client';

import { ArrowLeftRight } from 'lucide-react';
import { ErpPage, PageHeader } from '@/components/erp';
import MovementWorkspace from '@/components/cash/movement-workspace';

export default function CashExchangePage() {
  return (
    <ErpPage>
      <PageHeader
        icon={ArrowLeftRight}
        iconTone="online"
        title="Cash Exchange"
        subtitle="A customer pays online but wants cash back, or gives cash and wants it sent online. No sale — cash and online balances move, and any charge you keep is fee income."
      />
      <MovementWorkspace kind="exchange" />
    </ErpPage>
  );
}
