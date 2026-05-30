'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, Package, FileText, Settings, DollarSign, ShoppingCart,
  LogOut, Menu, X, LayoutDashboard, Warehouse, Scissors
} from 'lucide-react';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // Load sidebar state from localStorage
    const savedSidebarState = localStorage.getItem('admin_sidebar_open');
    if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true');
    }
    
    checkAuth();
    checkLicense();
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem('admin_sidebar_open', newState.toString());
  };

  const checkAuth = () => {
    const token = localStorage.getItem('pos_token');
    const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
    
    if (!token || user.role !== 'admin') {
      router.push('/login');
      return;
    }
    setLoading(false);
  };

  const checkLicense = async () => {
    try {
      const res = await fetch('/api/license/check');
      const data = await res.json();
      
      // If license grace period has ended and not on settings page, redirect
      if (data.status?.is_completely_expired && !pathname.startsWith('/admin/settings')) {
        router.push('/admin/settings?expired=true');
      }
    } catch (error) {
      console.error('License check failed:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    router.push('/login');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/admin/dashboard', color: 'text-gray-600' },
    { icon: DollarSign, label: 'Billing', href: '/admin/billing', color: 'text-teal-600' },
    { icon: Scissors, label: 'Services', href: '/admin/products', color: 'text-blue-600' },
    { icon: Warehouse, label: 'Inventory', href: '/admin/stock', color: 'text-indigo-600' },
    { icon: Users, label: 'Staff', href: '/admin/employees', color: 'text-green-600' },
    { icon: Users, label: 'Customers', href: '/admin/customers', color: 'text-pink-600' },
    { icon: FileText, label: 'Reports', href: '/admin/reports', color: 'text-purple-600' },
    { icon: Settings, label: 'Settings', href: '/admin/settings', color: 'text-gray-600' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 flex flex-col ${
        sidebarOpen ? 'w-64 translate-x-0' : 'w-28 -translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          {sidebarOpen && <h2 className="text-xl font-bold text-gray-800">Salon POS</h2>}
          <button onClick={toggleSidebar} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {menuItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={index}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-left ${
                  isActive ? 'bg-gray-100 border-l-4 border-gray-800' : 'hover:bg-gray-50'
                }`}
              >
                <item.icon className={`${item.color} ${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
                {sidebarOpen && (
                  <span className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className={sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'} />
            {sidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 min-h-screen ${
        sidebarOpen ? 'ml-0 lg:ml-64' : 'ml-0 lg:ml-20'
      }`}>
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button onClick={toggleSidebar} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
            <Menu size={24} />
          </button>
          <h2 className="text-lg font-bold text-gray-800">Salon POS</h2>
          <div className="w-10"></div>
        </div>
        {children}
      </div>
    </div>
  );
}
