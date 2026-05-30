'use client';

import AdminLayout from '@/components/layout/dashboard-layout';
import { CreditCard, MessageCircle, Scissors, Users, Warehouse } from 'lucide-react';
import { useRouter } from 'next/navigation';

const actions = [
  { label: 'Create Bill', description: 'Start a salon checkout with services and products.', href: '/admin/billing', icon: CreditCard },
  { label: 'Customers', description: 'Find or create customer profiles.', href: '/admin/customers', icon: Users },
  { label: 'Services', description: 'Review service pricing and duration.', href: '/admin/products', icon: Scissors },
  { label: 'Inventory', description: 'View stock and low-stock products.', href: '/admin/stock', icon: Warehouse },
  { label: 'Reminders', description: 'Send manual WhatsApp reminders.', href: '/admin/reminders', icon: MessageCircle },
];

export default function CashierDashboard() {
  const router = useRouter();

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-950">Cashier Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">Fast checkout tools for front-desk salon operations.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <button key={action.href} onClick={() => router.push(action.href)} className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-gray-400 hover:shadow-md">
                <action.icon className="mb-4 h-7 w-7 text-gray-800" />
                <h2 className="text-lg font-semibold text-gray-950">{action.label}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{action.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
