'use client';

import AdminLayout from '@/components/layout/dashboard-layout';
import { Award, CalendarCheck, Sparkles, TrendingUp } from 'lucide-react';

export default function BeauticianDashboard() {
  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-semibold text-gray-950">Beautician Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Beauty services, client history, and commission performance.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ['Assigned Beauty Services', 'View beauty services linked to your profile.', Sparkles],
              ['Completed Today', 'Track completed treatments for the day.', CalendarCheck],
              ['Commission', 'Review estimated treatment commission.', Award],
              ['Performance', 'Follow personal revenue and repeat clients.', TrendingUp],
            ].map(([title, description, Icon]) => (
              <div key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <Icon className="mb-4 h-7 w-7 text-pink-600" />
                <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
