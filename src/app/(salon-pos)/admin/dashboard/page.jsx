'use client';

/**
 * ADMIN DASHBOARD — the current Business Day. Periods, trends and breakdowns live on
 * Analytics and Summary. Same layout as the cashier dashboard (TodayDashboard).
 */

import { CalendarClock, ChartColumnBig, DoorOpen, ScrollText } from 'lucide-react';
import TodayDashboard from '@/components/dashboard/today-dashboard';
import { useReport } from '@/components/erp/use-report';

const SHORTCUTS = [
  { href: '/store/opening-closing', icon: DoorOpen, label: 'Opening & Closing' },
  { href: '/admin/appointments', icon: CalendarClock, label: 'Appointments' },
  { href: '/admin/executive-summary', icon: ScrollText, label: 'Summary report' },
  { href: '/admin/analytics', icon: ChartColumnBig, label: 'Analytics' },
];

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useReport('/api/admin/dashboard?period=today');
  const stats = data?.stats;
  const normalised = stats ? {
    store: stats.store,
    summary: stats.summary,
    queue: stats.queue,
    upcomingAppointments: stats.upcomingAppointments,
    pendingWebsiteRequests: stats.pendingWebsiteRequests,
    recentBills: stats.recentTransactions,
    staffActivity: stats.staffActivity,
    lowStock: (stats.lowStockItems || []).map((item) => ({ name: item.name, qty: item.qty, critical: item.status === 'critical' })),
    alerts: stats.alerts,
  } : null;

  return (
    <TodayDashboard
      data={normalised}
      error={error}
      loading={loading}
      reload={reload}
      role="admin"
      tokensHref="/dashboard/admin/tokens"
      shortcuts={SHORTCUTS}
    />
  );
}
