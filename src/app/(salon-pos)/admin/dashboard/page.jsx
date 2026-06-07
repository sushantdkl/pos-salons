'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users, Package, DollarSign, ShoppingCart, TrendingUp, TrendingDown, PieChart, BarChart3, AlertCircle, Zap, Ticket, ArrowRight
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { getNepaliDateString } from '@/lib/time-utils';

function GrowthBadge({ current, previous }) {
  if (!previous || previous === 0) return null;

  const growth = ((current - previous) / previous) * 100;
  const isPositive = growth >= 0;

  return (
    <div className={`flex items-center space-x-1 ${isPositive ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'} px-2.5 py-1 rounded-md`}>
      {isPositive ? (
        <TrendingUp className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <TrendingDown className="w-3.5 h-3.5 text-red-600" />
      )}
      <span className={`text-xs font-medium ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
        {isPositive ? '+' : ''}{growth.toFixed(1)}%
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Calculate profit (mock data - you'll get real data from API)
  const calculateProfit = () => {
    const revenue = stats?.todaySales || 0;
    const costs = stats?.todayCosts || 0;
    return revenue - costs;
  };

  const profitMargin = stats?.todaySales ? ((calculateProfit() / stats.todaySales) * 100) : 0;
  const tokenStats = stats?.tokenStats || {};

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1 text-sm">Welcome back, Admin - {getNepaliDateString(new Date())}</p>
          </div>
          <div className="flex items-center space-x-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 text-sm font-medium">Live</span>
          </div>
        </div>
      </header>

      <div className="p-8 bg-gray-50">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-blue-50 rounded-lg">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
              <GrowthBadge current={stats?.todaySales || 0} previous={stats?.yesterdaySales || 0} />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900">{formatCurrency(stats?.todaySales || 0)}</h3>
            <p className="text-gray-500 text-sm mt-1.5">Today&apos;s Sales</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-green-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              {profitMargin > 0 && (
                <div className="flex items-center space-x-1 bg-green-50 border border-green-200 px-2.5 py-1 rounded-md">
                  <Zap className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs text-green-700 font-medium">{profitMargin.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <h3 className="text-2xl font-semibold text-gray-900">{formatCurrency(calculateProfit())}</h3>
            <p className="text-gray-500 text-sm mt-1.5">Today&apos;s Net</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-purple-50 rounded-lg">
                <ShoppingCart className="w-6 h-6 text-purple-600" />
              </div>
              <GrowthBadge current={stats?.todayOrders || 0} previous={stats?.yesterdayOrders || 0} />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900">{stats?.todayOrders || 0}</h3>
            <p className="text-gray-500 text-sm mt-1.5">Today&apos;s Bills</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-gray-100 rounded-lg">
                <Users className="w-6 h-6 text-gray-700" />
              </div>
              <div className="flex items-center space-x-1 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md">
                <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                <span className="text-xs text-gray-700 font-medium">Active</span>
              </div>
            </div>
            <h3 className="text-2xl font-semibold text-gray-900">{stats?.totalEmployees || 0}</h3>
            <p className="text-gray-500 text-sm mt-1.5">Total Staff</p>
          </div>
        </div>

        {/* Walk-in queue summary — replaces 9 scattered token cards */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2.5">
                <Ticket className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Walk-in Queue</h2>
                <p className="text-sm text-gray-500">Today&apos;s token and billing activity</p>
              </div>
            </div>
            <Link
              href="/dashboard/admin/tokens"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 transition-colors hover:text-amber-800"
            >
              Manage tokens
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: 'Waiting now',
                value: tokenStats.waiting || 0,
                tone: Number(tokenStats.waiting || 0) > 0 ? 'amber' : 'default',
              },
              { label: 'Tokens generated', value: tokenStats.generated || 0, tone: 'default' },
              { label: 'Converted to bills', value: tokenStats.billsDone || 0, tone: 'default' },
              {
                label: 'Cancelled / no-show',
                value: Number(tokenStats.cancelled || 0) + Number(tokenStats.noShow || 0),
                tone: 'muted',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border p-4 ${
                  item.tone === 'amber'
                    ? 'border-amber-200 bg-amber-50'
                    : item.tone === 'muted'
                      ? 'border-gray-200 bg-gray-50'
                      : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-950">{item.value}</p>
              </div>
            ))}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm md:grid-cols-5">
            {[
              ['Digital tokens', tokenStats.digitalTokens || 0],
              ['Printed tokens', tokenStats.printedTokens || 0],
              ['Digital bills', tokenStats.digitalBills || 0],
              ['Printed bills', tokenStats.printedBills || 0],
              ['Direct bills', tokenStats.billsWithoutToken || 0],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 md:flex-col md:items-start">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
          {/* Sales Chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-gray-700" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Weekly Sales</h2>
              </div>
            </div>
            <div className="space-y-3.5">
              {(stats?.weeklySales || []).map((dayData, index) => {
                const maxSales = Math.max(...(stats?.weeklySales || []).map(d => d.sales), 1);
                const percentage = (dayData.sales / maxSales) * 100;
                return (
                  <div key={index}>
                    <div className="flex justify-between mb-1.5">
                      <span className="font-medium text-gray-600 text-sm">{dayData.day}</span>
                      <span className="font-semibold text-gray-900 text-sm">{formatCurrency(dayData.sales)}</span>
                    </div>
                    <div className="relative w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="absolute top-0 left-0 h-2.5 rounded-full bg-gray-800 transition-all duration-700"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revenue Distribution Pie Chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <PieChart className="w-5 h-5 text-gray-700" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Revenue Mix</h2>
              </div>
            </div>
            <div className="flex items-center justify-center mb-6">
              <div className="relative w-64 h-64">
                {/* Pie Chart Visual */}
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="20" strokeDasharray="75.4 251.2" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="20" strokeDasharray="62.8 251.2" strokeDashoffset="-75.4" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#f59e0b" strokeWidth="20" strokeDasharray="50.24 251.2" strokeDashoffset="-138.2" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#ef4444" strokeWidth="20" strokeDasharray="62.8 251.2" strokeDashoffset="-188.44" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">100%</p>
                    <p className="text-sm text-gray-600">Total</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(stats?.revenueSources || []).map((item, index) => {
                const colors = ['bg-gray-800', 'bg-gray-600', 'bg-gray-500', 'bg-gray-400'];
                const typeLabels = {
                  service: 'Services',
                  product: 'Products',
                  online: 'Online'
                };
                return (
                  <div key={index} className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{typeLabels[item.type] || item.type}</p>
                      <p className="text-xs text-gray-500">{item.percentage}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Row - Inventory Alerts & Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Low Stock Alerts */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Stock Alerts</h2>
            </div>
            <div className="space-y-2.5">
              {(stats?.lowStockItems || []).length > 0 ? (
                (stats?.lowStockItems || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${item.status === 'critical' ? 'bg-red-500' : 'bg-yellow-500'} animate-pulse`} />
                      <span className="font-medium text-gray-900 text-sm">{item.name}</span>
                    </div>
                    <span className={`text-sm font-semibold ${item.status === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {item.qty} {item.unit}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">All stock levels are good!</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Package className="w-5 h-5 text-gray-700" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Business Overview</h2>
            </div>
            <dl className="divide-y divide-gray-100">
              {[
                ['Weekly revenue', formatCurrency(stats?.weeklyRevenue || 0)],
                ['Monthly revenue', formatCurrency(stats?.monthlySales || 0)],
                ['Average bill value', formatCurrency(stats?.avgOrder || 0)],
                ['Customers served today', stats?.todayCustomers || 0],
                ['Services sold today', stats?.todayServices || 0],
                ['Active services', stats?.totalProducts || 0],
                ['Customer retention', `${stats?.repeatCustomerRate || 0}%`],
                ['Commission earned', formatCurrency(stats?.commissionSummary || 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm text-gray-600">{label}</dt>
                  <dd className="text-sm font-semibold text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
