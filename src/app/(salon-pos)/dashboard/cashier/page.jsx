'use client';

/**
 * CASHIER DASHBOARD — the current Business Day, same layout as the admin dashboard.
 * /api/cashier/dashboard strips every payroll figure server-side; totals still reconcile
 * with the admin view and with Close Store because the shared money service computes them.
 */

import { CalendarClock, DoorOpen, HandCoins, PiggyBank, Receipt, ScrollText } from 'lucide-react';
import TodayDashboard from '@/components/dashboard/today-dashboard';
import { useReport } from '@/components/erp/use-report';

const SHORTCUTS = [
  { href: '/store/opening-closing', icon: DoorOpen, label: 'Opening & Closing' },
  { href: '/admin/appointments', icon: CalendarClock, label: 'Appointments' },
  { href: '/dashboard/cashier/daily-expenses', icon: Receipt, label: 'Daily expenses' },
  { href: '/dashboard/cashier/savings', icon: PiggyBank, label: 'Savings' },
  { href: '/cashier/credit', icon: HandCoins, label: 'Credit collection' },
  { href: '/cashier/executive-summary', icon: ScrollText, label: 'Summary report' },
];

export default function CashierDashboardPage() {
  const { data, error, loading, reload } = useReport('/api/cashier/dashboard?period=today');
  const normalised = data ? {
    store: data.store,
    summary: data.summary,
    queue: data.queue,
    upcomingAppointments: data.upcomingAppointments,
    pendingWebsiteRequests: data.pendingWebsiteRequests,
    recentBills: data.recentBills,
    staffActivity: data.staffActivity,
    lowStock: (data.alerts?.lowStock || []).map((item) => ({
      name: item.name,
      qty: item.currentStock,
      critical: item.currentStock <= item.lowStockThreshold * 0.5,
    })),
    alerts: data.alerts,
  } : null;

  return (
    <TodayDashboard
      data={normalised}
      error={error}
      loading={loading}
      reload={reload}
      role="cashier"
      tokensHref="/dashboard/cashier/tokens"
      shortcuts={SHORTCUTS}
    />
  );
}
