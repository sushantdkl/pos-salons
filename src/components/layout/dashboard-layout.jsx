'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, FileText, Settings, DollarSign,
  LogOut, Menu, X, LayoutDashboard, Warehouse, Scissors, MessageCircle, Globe
} from 'lucide-react';
import { canAccessPath, dashboardPathForRole, normalizeRole } from '@/constants/roles';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const SIDEBAR_SCROLL_KEY = 'salon_pos_sidebar_scroll';
let authInitialized = false;

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const navRef = useRef(null);
  const [loading, setLoading] = useState(() => !authInitialized);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentRole, setCurrentRole] = useState('admin');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem('admin_sidebar_open', newState.toString());
  };

  const saveSidebarScroll = () => {
    if (navRef.current) {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navRef.current.scrollTop));
    }
  };

  const restoreSidebarScroll = () => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved !== null) {
      nav.scrollTop = Number(saved);
    }
  };

  const checkAuth = () => {
    const token = localStorage.getItem('pos_token');
    const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
    const role = normalizeRole(user.role);

    if (!token) {
      router.push('/login');
      return false;
    }
    if (!canAccessPath(role, pathname)) {
      router.push(dashboardPathForRole(role));
      return false;
    }
    setCurrentRole(role);
    authInitialized = true;
    setLoading(false);
    return true;
  };

  const checkLicense = async () => {
    if (process.env.NEXT_PUBLIC_LICENSE_ENABLED !== 'true') {
      return;
    }

    try {
      const res = await fetch('/api/license/check');
      const data = await res.json();

      if (data.status?.is_completely_expired && !pathname.startsWith('/admin/settings')) {
        router.push('/admin/settings?expired=true');
      }
    } catch (error) {
      console.error('License check failed:', error);
    }
  };

  useEffect(() => {
    const savedSidebarState = localStorage.getItem('admin_sidebar_open');
    if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true');
    }

    checkAuth();
    checkLicense();
  }, []);

  useEffect(() => {
    if (authInitialized) {
      checkAuth();
    }
  }, [pathname]);

  useLayoutEffect(() => {
    restoreSidebarScroll();
  }, [pathname]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape' && sidebarOpen && window.innerWidth < 1024) {
        setSidebarOpen(false);
        localStorage.setItem('admin_sidebar_open', 'false');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [sidebarOpen]);

  const handleLogout = async () => {
    setLogoutLoading(true);
    const token = localStorage.getItem('pos_token');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Local session cleanup is still required if the network drops during logout.
    }
    authInitialized = false;
    sessionStorage.removeItem(SIDEBAR_SCROLL_KEY);
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setLogoutLoading(false);
    setLogoutOpen(false);
    router.push('/login');
  };

  const allMenuItems = [
    { roles: ['admin'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/admin', color: 'text-gray-600' },
    { roles: ['cashier'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/cashier', color: 'text-gray-600' },
    { roles: ['barber'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/barber', color: 'text-gray-600' },
    { roles: ['stylist'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/stylist', color: 'text-gray-600' },
    { roles: ['beautician'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/beautician', color: 'text-gray-600' },
    { roles: ['admin'], icon: Scissors, label: 'Tokens', href: '/dashboard/admin/tokens', color: 'text-amber-700' },
    { roles: ['cashier'], icon: Scissors, label: 'Tokens', href: '/dashboard/cashier/tokens', color: 'text-amber-700' },
    { roles: ['barber'], icon: Scissors, label: 'Queue', href: '/dashboard/barber/queue', color: 'text-amber-700' },
    { roles: ['stylist'], icon: Scissors, label: 'Queue', href: '/dashboard/stylist/queue', color: 'text-amber-700' },
    { roles: ['beautician'], icon: Scissors, label: 'Queue', href: '/dashboard/beautician/queue', color: 'text-amber-700' },
    { roles: ['admin', 'cashier'], icon: DollarSign, label: 'Billing', href: '/admin/billing', color: 'text-teal-600' },
    { roles: ['admin', 'cashier'], icon: Scissors, label: 'Services', href: '/admin/products', color: 'text-blue-600' },
    { roles: ['admin', 'cashier'], icon: Warehouse, label: 'Inventory', href: '/admin/stock', color: 'text-indigo-600' },
    { roles: ['admin'], icon: Users, label: 'Staff', href: '/admin/employees', color: 'text-green-600' },
    { roles: ['admin', 'cashier'], icon: Users, label: 'Customers', href: '/admin/customers', color: 'text-pink-600' },
    { roles: ['admin'], icon: FileText, label: 'Reports', href: '/admin/reports', color: 'text-purple-600' },
    { roles: ['admin'], icon: Users, label: 'Performance', href: '/dashboard/admin/staff-performance', color: 'text-amber-700' },
    { roles: ['admin'], icon: DollarSign, label: 'Expenses & Salary', href: '/dashboard/admin/expenses', color: 'text-emerald-700' },
    { roles: ['admin'], icon: Globe, label: 'Website CMS', href: '/dashboard/admin/website', color: 'text-blue-700' },
    { roles: ['admin', 'cashier'], icon: MessageCircle, label: 'Reminders', href: '/admin/reminders', color: 'text-green-600' },
    { roles: ['admin'], icon: Settings, label: 'Settings', href: '/admin/settings', color: 'text-gray-600' },
  ];
  const menuItems = allMenuItems.filter((item) => !item.roles || item.roles.includes(currentRole));

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
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/35 lg:hidden"
          onClick={() => {
            setSidebarOpen(false);
            localStorage.setItem('admin_sidebar_open', 'false');
          }}
        />
      ) : null}

      <aside className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 flex flex-col ${
        sidebarOpen ? 'w-64 translate-x-0' : 'w-28 -translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          {sidebarOpen ? <h2 className="text-xl font-bold text-gray-800">Salon POS</h2> : null}
          <button type="button" onClick={toggleSidebar} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav
          ref={navRef}
          onScroll={saveSidebarScroll}
          className="flex-1 overflow-y-auto p-4 space-y-2"
        >
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={saveSidebarScroll}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-gray-100 border-l-4 border-gray-800' : 'hover:bg-gray-50'
                }`}
              >
                <item.icon className={`${item.color} ${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
                {sidebarOpen ? (
                  <span className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className={sidebarOpen ? 'w-5 h-5' : 'w-6 h-6' } />
            {sidebarOpen ? <span className="font-medium">Logout</span> : null}
          </button>
        </div>
      </aside>

      <div className={`transition-all duration-300 min-h-screen ${
        sidebarOpen ? 'ml-0 lg:ml-64' : 'ml-0 lg:ml-20'
      }`}>
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button type="button" onClick={toggleSidebar} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700">
            <Menu size={24} />
          </button>
          <h2 className="text-lg font-bold text-gray-800">Salon POS</h2>
          <div className="w-10" />
        </div>
        {children}
      </div>
      <ConfirmDialog
        open={logoutOpen}
        title="Confirm Logout"
        description="Are you sure you want to sign out?"
        confirmLabel="Logout"
        destructive
        loading={logoutLoading}
        onCancel={() => !logoutLoading && setLogoutOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
