'use client';

import { useState, useEffect } from 'react';
import { Calendar, Download, TrendingUp, DollarSign, ShoppingCart, Users, Award, Zap, Target, ArrowUp, ArrowDown } from 'lucide-react';

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return numberValue(value).toFixed(2);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const dataBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [reports, setReports] = useState(null);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      let url = `/api/admin/reports?period=${period}`;
      
      if (period === 'custom' && customDates.start && customDates.end) {
        url += `&startDate=${customDates.start}&endDate=${customDates.end}`;
      }
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReports(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [period]);

  const exportReport = () => {
    const transactions = reports?.transactions || [];
    const paymentRows = Object.entries(reports?.paymentMethods || {});
    const topItems = reports?.topItems || [];
    const rows = [
      ['Report Period', period],
      ['Exported At', new Date().toLocaleString()],
      [],
      ['Summary'],
      ['Total Sales', money(reports?.totalSales)],
      ['Total Bills', reports?.totalBills || 0],
      ['Average Bill Value', money(reports?.avgBillValue)],
      ['Unique Customers', reports?.uniqueCustomers || 0],
      [],
      ['Payment Methods'],
      ['Payment Method', 'Transaction Count', 'Amount'],
      ...paymentRows.map(([method, data]) => [method, data.count || 0, money(data.amount)]),
      [],
      ['Top Services'],
      ['Service', 'Quantity', 'Revenue'],
      ...topItems.map((item) => [item.name, item.quantity || 0, money(item.revenue)]),
      [],
      ['Transactions'],
      ['Date', 'Invoice', 'Customer', 'Phone', 'Payment Method', 'Subtotal', 'Discount', 'Tax', 'Service Charge', 'Grand Total', 'Amount Paid'],
      ...transactions.map((transaction) => [
        formatDateTime(transaction.transactionDate),
        transaction.billNumber,
        transaction.customerName,
        transaction.customerPhone,
        transaction.paymentMethod,
        money(transaction.subtotal),
        money(transaction.discountAmount),
        money(transaction.tax),
        money(transaction.serviceCharge),
        money(transaction.grandTotal),
        money(transaction.amountPaid),
      ]),
    ];
    downloadCsv(`report-${period}-${new Date().toISOString().split('T')[0]}.csv`, rows);
  };

  return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900">Reports & Analytics</h1>
              <p className="text-gray-500 mt-1">Sales and performance insights</p>
            </div>
            <button
              onClick={exportReport}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

        {/* Period Selector */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setPeriod('today')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${period === 'today' ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Today
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${period === 'week' ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${period === 'month' ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              This Month
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${period === 'custom' ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Custom Range
            </button>
            
            {period === 'custom' && (
              <div className="flex items-center space-x-2 ml-2">
                <input
                  type="date"
                  value={customDates.start}
                  onChange={(e) => setCustomDates({...customDates, start: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <span className="text-gray-500 text-sm">to</span>
                <input
                  type="date"
                  value={customDates.end}
                  onChange={(e) => setCustomDates({...customDates, end: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <button
                  onClick={fetchReports}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors shadow-sm"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>

        {reports && (
          <>
            {/* Summary Cards with Clean Design */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-green-50 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">Rs {money(reports.totalSales)}</h3>
                <p className="text-gray-500 text-sm mt-1.5">Total Sales Revenue</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-blue-50 rounded-lg">
                    <ShoppingCart className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">{reports.totalBills || 0}</h3>
                <p className="text-gray-500 text-sm mt-1.5">Total Bills</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-purple-50 rounded-lg">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">Rs {money(reports.avgBillValue)}</h3>
                <p className="text-gray-500 text-sm mt-1.5">Avg Bill Value</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 bg-gray-100 rounded-lg">
                    <Users className="w-5 h-5 text-gray-700" />
                  </div>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">{reports.uniqueCustomers || 0}</h3>
                <p className="text-gray-500 text-sm mt-1.5">Total Customers</p>
              </div>
            </div>

            {/* Payment Methods Breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-gray-700" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Payment Methods Breakdown</h2>
              </div>
              <div className="space-y-4">
                {reports.paymentMethods && Object.keys(reports.paymentMethods).length > 0 ? (
                  Object.entries(reports.paymentMethods).map(([method, data], index) => {
                    const amount = numberValue(data.amount);
                    const percentage = (amount / numberValue(reports.totalSales) * 100) || 0;
                    return (
                      <div key={method} className="group">
                        <div className="flex justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-gray-700"></div>
                            <span className="font-medium text-gray-900 text-sm capitalize">{method}</span>
                          </div>
                          <span className="font-semibold text-gray-900 text-sm">Rs {money(amount)} ({data.count} txns)</span>
                        </div>
                        <div className="relative w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-2.5 rounded-full bg-gray-800 transition-all duration-700 ease-out group-hover:bg-gray-700"
                            style={{ width: `${percentage}%` }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No payment data available</p>
                    <p className="text-sm mt-1">Payments will appear here once transactions are recorded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Details */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-gray-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
                  <p className="text-sm text-gray-500">Invoices included in the selected report period with actual transaction dates.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(reports.transactions || []).length ? (
                      reports.transactions.map((transaction) => (
                        <tr key={transaction.id || transaction.billNumber} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{formatDateTime(transaction.transactionDate)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{transaction.billNumber || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div className="font-medium text-gray-900">{transaction.customerName || 'Walk-in Customer'}</div>
                            {transaction.customerPhone ? <div className="text-xs text-gray-500">{transaction.customerPhone}</div> : null}
                          </td>
                          <td className="px-4 py-3 text-sm capitalize text-gray-700">{transaction.paymentMethod || '-'}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Rs {money(transaction.grandTotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No transactions found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Selling Items */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Award className="w-5 h-5 text-gray-700" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Top Services</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Revenue</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Performance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reports.topItems?.slice(0, 10).map((item, index) => {
                      const maxRevenue = numberValue(reports.topItems[0]?.revenue) || 1;
                      const itemRevenue = numberValue(item.revenue);
                      const percentage = (itemRevenue / maxRevenue * 100);
                      const medals = ['🥇', '🥈', '🥉'];
                      return (
                        <tr key={index} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              {index < 3 ? (
                                <span className="text-xl">{medals[index]}</span>
                              ) : (
                                <span className="font-semibold text-gray-500 text-sm">#{index + 1}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 text-sm group-hover:text-gray-700 transition-colors">
                              {item.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                              {item.quantity} sold
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-gray-900 text-sm">Rs {money(itemRevenue)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end space-x-2">
                              <div className="w-20 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="bg-gray-800 h-1.5 rounded-full transition-all duration-700"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600 w-10 text-right">{percentage.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Quick Insights */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-2 mb-2">
                    <Zap className="w-4 h-4 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">Best Seller</span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{reports.topItems?.[0]?.name || 'N/A'}</p>
                  <p className="text-xs text-gray-500 mt-1">{reports.topItems?.[0]?.quantity || 0} units sold</p>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">Top Revenue</span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">Rs {money(reports.topItems?.[0]?.revenue)}</p>
                  <p className="text-xs text-gray-500 mt-1">From best seller</p>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-2 mb-2">
                    <Award className="w-4 h-4 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">Total Items</span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{reports.topItems?.length || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Items in top list</p>
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
  );
}
