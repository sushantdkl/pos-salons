'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { Award, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

function Highlight({ title, staff, metric }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-gray-950">{staff?.name || 'No data'}</p>
      <p className="mt-1 text-sm text-gray-600">{metric || staff?.role || ''}</p>
    </div>
  );
}

export default function AdminStaffPerformancePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem('pos_token');
      const response = await fetch('/api/admin/staff-performance?scope=admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setData(await response.json());
    }
    load();
  }, []);

  const highlights = data?.highlights || {};
  const leaderboard = data?.month || [];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-950">Staff Performance</h1>
            <p className="mt-1 text-sm text-gray-600">Leaderboards, commission, customers served, and revenue by staff.</p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Highlight title="Top Revenue Generator" staff={highlights.topRevenueGenerator} metric={formatCurrency(highlights.topRevenueGenerator?.revenue || 0)} />
            <Highlight title="Top Commission Earner" staff={highlights.topCommissionEarner} metric={formatCurrency(highlights.topCommissionEarner?.commission || 0)} />
            <Highlight title="Most Services Completed" staff={highlights.mostServicesCompleted} metric={`${highlights.mostServicesCompleted?.servicesCompleted || 0} services`} />
            <Highlight title="Most Customers Served" staff={highlights.mostCustomersServed} metric={`${highlights.mostCustomersServed?.customersServed || 0} customers`} />
            <Highlight title="Best Barber" staff={highlights.bestBarber} metric={formatCurrency(highlights.bestBarber?.revenue || 0)} />
            <Highlight title="Best Stylist" staff={highlights.bestStylist} metric={formatCurrency(highlights.bestStylist?.revenue || 0)} />
            <Highlight title="Best Beautician" staff={highlights.bestBeautician} metric={formatCurrency(highlights.bestBeautician?.revenue || 0)} />
            <Highlight title="Lowest Performance" staff={highlights.lowestPerformanceStaff} metric={formatCurrency(highlights.lowestPerformanceStaff?.revenue || 0)} />
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 p-5">
              <h2 className="text-lg font-semibold text-gray-950">Staff Leaderboard This Month</h2>
              <div className="flex gap-2 text-gray-500">
                <TrendingUp className="h-5 w-5" />
                <Award className="h-5 w-5" />
                <Users className="h-5 w-5" />
              </div>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 text-left text-sm text-gray-600">
                <tr>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 text-right">Services</th>
                  <th className="px-5 py-3 text-right">Customers</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaderboard.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium text-gray-950">{row.name}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{row.role}</td>
                    <td className="px-5 py-3 text-right">{row.servicesCompleted}</td>
                    <td className="px-5 py-3 text-right">{row.customersServed}</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(row.revenue)}</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!leaderboard.length && (
              <div className="flex items-center justify-center gap-2 p-8 text-gray-500">
                <TrendingDown className="h-5 w-5" />
                No staff performance data yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
