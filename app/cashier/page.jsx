'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Receipt, Clock, CheckCircle, TrendingUp, 
  Calendar, CreditCard, AlertCircle, Users, ShoppingBag
} from 'lucide-react';
import { getNepaliDateString } from '@/lib/time-utils';

export default function CashierDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    pendingBills: 0,
    completedBills: 0,
    averageOrderValue: 0,
    readyCount: 0,
    activeCount: 0,
    completedTodayCount: 0,
    allOrdersCount: 0
  });
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('ready'); // ready, active, completed, all

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [filter, user]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      console.log('Cashier checkAuth - token:', token ? 'exists' : 'missing');
      
      if (!token || token === 'null' || token === 'undefined') {
        console.log('Cashier checkAuth - no valid token, redirecting to login');
        setLoading(false);
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      console.log('Cashier checkAuth - verify response:', response.ok);

      if (!response.ok) {
        console.log('Cashier checkAuth - verify failed, redirecting to login');
        localStorage.removeItem('token');
        setLoading(false);
        router.push('/login');
        return;
      }

      const data = await response.json();
      console.log('Cashier checkAuth - user role:', data.user.role);
      
      if (data.user.role !== 'cashier' && data.user.role !== 'admin') {
        console.log('Cashier checkAuth - wrong role, redirecting to login');
        setLoading(false);
        router.push('/login');
        return;
      }

      console.log('Cashier checkAuth - success, setting user');
      setUser(data.user);
      setLoading(false);
    } catch (error) {
      console.error('Cashier checkAuth - error:', error);
      localStorage.removeItem('token');
      setLoading(false);
      router.push('/login');
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('pos_token');
      
      // Don't fetch if no valid token
      if (!token || token === 'null' || token === 'undefined') {
        return;
      }
      
      // Fetch orders
      const ordersRes = await fetch('/api/restaurant/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        
        // Filter orders based on selected filter
        let filteredOrders = ordersData.orders || [];
        
        if (filter === 'ready') {
          // Orders ready for payment (served status - waiter has completed service)
          filteredOrders = filteredOrders.filter(o => o.status === 'served');
        } else if (filter === 'active') {
          // Active orders (pending, preparing, ready - waiter hasn't completed yet)
          filteredOrders = filteredOrders.filter(o => 
            ['pending', 'preparing', 'ready'].includes(o.status)
          );
        } else if (filter === 'completed') {
          // Completed orders today (payment processed) - use Nepal time
          const today = getNepaliDateString();
          filteredOrders = filteredOrders.filter(o => 
            o.status === 'completed' && 
            o.created_at && 
            o.created_at.startsWith(today)
          );
        }
        
        setOrders(filteredOrders);
        
        // Calculate stats using Nepal time consistently
        const allOrders = ordersData.orders || [];
        const today = getNepaliDateString();
        const todayOrders = allOrders.filter(o => 
          o.created_at && o.created_at.startsWith(today)
        );
        
        const completedToday = todayOrders.filter(o => o.status === 'completed');
        const todaySales = completedToday.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const pendingBills = allOrders.filter(o => o.status === 'served').length;
        
        // Calculate counts for each filter - use created_at for consistency
        const readyCount = allOrders.filter(o => o.status === 'served').length;
        const activeCount = allOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length;
        const completedTodayCount = allOrders.filter(o => 
          o.status === 'completed' && o.created_at && o.created_at.startsWith(today)
        ).length;
        const allOrdersCount = allOrders.length;
        
        setStats({
          todaySales,
          todayOrders: todayOrders.length,
          pendingBills,
          completedBills: completedToday.length,
          averageOrderValue: completedToday.length > 0 ? todaySales / completedToday.length : 0,
          readyCount,
          activeCount,
          completedTodayCount,
          allOrdersCount
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    router.push('/');
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      preparing: 'bg-orange-100 text-orange-800 border-orange-300',
      ready: 'bg-green-100 text-green-800 border-green-300',
      served: 'bg-blue-100 text-blue-800 border-blue-300',
      completed: 'bg-purple-100 text-purple-800 border-purple-300',
      cancelled: 'bg-red-100 text-red-800 border-red-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatusText = (status) => {
    const texts = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Ready for Payment',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return texts[status] || status;
  };

  const formatCurrency = (amount) => {
    return `Rs ${amount?.toFixed(2) || '0.00'}`;
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-700 text-lg">Loading cashier dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg">
                <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Cashier</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Welcome, {user?.full_name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleLogout}
                className="px-3 py-2 sm:px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm sm:text-base"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 sm:p-5">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Sales</p>
            <p className="text-base sm:text-2xl font-bold text-gray-900">{formatCurrency(stats.todaySales)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 sm:p-5">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <ShoppingBag className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Orders</p>
            <p className="text-base sm:text-2xl font-bold text-gray-900">{stats.todayOrders}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 sm:p-5">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-orange-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Pending</p>
            <p className="text-base sm:text-2xl font-bold text-gray-900">{stats.pendingBills}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 sm:p-5">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Done</p>
            <p className="text-base sm:text-2xl font-bold text-gray-900">{stats.completedBills}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 sm:p-5 hidden md:block">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-1">Avg Value</p>
            <p className="text-base sm:text-2xl font-bold text-gray-900">{formatCurrency(stats.averageOrderValue)}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow p-2 mb-4 sm:mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('ready')}
            className={`flex-1 py-3 px-4 rounded-md font-semibold transition-all ${
              filter === 'ready'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Ready for Payment ({stats.readyCount || 0})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`flex-1 py-3 px-4 rounded-md font-semibold transition-all ${
              filter === 'active'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Active Orders ({stats.activeCount || 0})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`flex-1 py-3 px-4 rounded-md font-semibold transition-all ${
              filter === 'completed'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Completed Today ({stats.completedTodayCount || 0})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-3 px-4 rounded-md font-semibold transition-all ${
              filter === 'all'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Orders ({stats.allOrdersCount || 0})
          </button>
        </div>

        {/* Orders List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Receipt className="w-5 h-5 mr-2 text-blue-600" />
              {filter === 'ready' ? 'Ready for Payment (Served)' : 
               filter === 'active' ? 'Active Orders (In Service)' : 
               filter === 'completed' ? 'Completed Today' : 'All Orders'}
            </h2>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Table
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono font-semibold text-gray-900">
                          #{order.id.toString().padStart(4, '0')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-gray-900">{order.table_number}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatTime(order.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {order.item_count || 0} items
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-bold text-gray-900">
                          {formatCurrency(order.total_amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => router.push(`/cashier/bill/${order.id}`)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium"
                        >
                          {order.status === 'served' ? 'Process Payment' : 
                           order.status === 'completed' ? 'View Details' : 'View / Process Payment'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
