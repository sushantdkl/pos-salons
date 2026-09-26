'use client';

/**
 * Business Day History — every business day with its persisted close snapshots.
 * Figures come from getBusinessDayHistory: opening cash is the first session's float, expected
 * and counted cash are the FINAL session's close (never a sum), differences are additive, and
 * net sales are billed sales less voids processed that day.
 */

import { CalendarDays } from 'lucide-react';
import BusinessDayHistory from '@/components/store/business-day-history';
import {
  count, ErpPage, ErrorState, LoadingState, MetricCard, MetricGroup, money, PageHeader, PrintButton,
  PrintHeader, RefreshButton,
} from '@/components/erp';
import { useReport } from '@/components/erp/use-report';

export default function BusinessDayHistoryPage() {
  const { data, error, loading, reload } = useReport('/api/store/history?limit=120');
  const days = data?.days || [];
  const closedDays = days.filter((day) => day.status !== 'OPEN');
  const shortages = closedDays.filter((day) => day.difference < 0);

  return (
    <ErpPage>
      <PrintHeader title="Business Day History" period={`Last ${days.length} business days`} />
      <PageHeader
        icon={CalendarDays}
        iconTone="cash"
        title="Business Day History"
        subtitle="Every business day, its store sessions and how each close reconciled."
        actions={<><PrintButton /><RefreshButton loading={loading} onClick={reload} /></>}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          <MetricGroup columns={4}>
            <MetricCard label="Business days" value={count(days.length)} tone="neutral" />
            <MetricCard label="Net sales (listed days)" value={money(days.reduce((sum, day) => sum + Number(day.netSales || 0), 0))} tone="inflow" />
            <MetricCard label="Days with a shortage" value={count(shortages.length)} tone={shortages.length ? 'outflow' : 'neutral'} />
            <MetricCard label="Total cash difference" value={money(closedDays.reduce((sum, day) => sum + Number(day.difference || 0), 0))} tone="cash" hint="Sum of every session's shortage (−) and overage (+)." />
          </MetricGroup>
          <BusinessDayHistory days={days} />
        </div>
      ) : null}
    </ErpPage>
  );
}
