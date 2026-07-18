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
const DESKTOP_MQ = '(min-width: 1024px)';
let authInitialized = false;

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(DESKTOP_MQ).matches;
}

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const navRef = useRef(null);
  const [loading, setLoading] = useState(() => !authInitialized);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [currentRole, setCurrentRole] = useState('admin');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const closeMobileSidebar = () => setSidebarOpen(false);

  const toggleSidebar = () => {
    if (isDesktopViewport()) {
      setDesktopCollapsed((current) => {
        const next = !current;
        localStorage.setItem('admin_sidebar_collapsed', String(next));
        return next;
      });
      return;
    }
    setSidebarOpen((current) => !current);
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
    const desktop = isDesktopViewport();
    setIsDesktop(desktop);
    setSidebarOpen(false);
    const savedCollapsed = localStorage.getItem('admin_sidebar_collapsed');
    if (savedCollapsed !== null) {
      setDesktopCollapsed(savedCollapsed === 'true');
    }

    const media = window.matchMedia(DESKTOP_MQ);
    const onChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };
    media.addEventListener('change', onChange);

    checkAuth();
    checkLicense();

    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (authInitialized) {
      checkAuth();
    }
    // Close drawer after navigation on phones/tablets.
    if (!isDesktopViewport()) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  useLayoutEffect(() => {
    restoreSidebarScroll();
  }, [pathname]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape' && sidebarOpen && !isDesktopViewport()) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!isDesktop && sidebarOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [isDesktop, sidebarOpen]);

  const handleLogout = async () => {
    setLogoutLoading(true);
    const token = localStorage.getItem('pos_token');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ token: token || '' }),
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-4 border-gray-900" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const showExpanded = isDesktop ? !desktopCollapsed : true;
  const desktopWidthClass = desktopCollapsed ? 'lg:w-20' : 'lg:w-64';
  const contentMarginClass = desktopCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[min(18rem,88vw)] flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-out lg:translate-x-0 ${desktopWidthClass} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 sm:px-4">
          {showExpanded ? <h2 className="truncate text-lg font-bold text-gray-800 sm:text-xl">Salon POS</h2> : null}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={showExpanded ? 'Collapse menu' : 'Expand menu'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100"
          >
            {isDesktop ? (desktopCollapsed ? <Menu size={22} /> : <X size={22} />) : <X size={22} />}
          </button>
        </div>

        <nav
          ref={navRef}
          onScroll={saveSidebarScroll}
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
        >
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  saveSidebarScroll();
                  if (!isDesktopViewport()) closeMobileSidebar();
                }}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  isActive ? 'border-l-4 border-gray-900 bg-gray-100' : 'hover:bg-gray-50'
                } ${showExpanded ? '' : 'justify-center px-2'}`}
              >
                <item.icon className={`${item.color} h-5 w-5 shrink-0`} />
                {showExpanded ? (
                  <span className={`truncate text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-gray-200 p-3">
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-600 transition-colors hover:bg-red-50 ${
              showExpanded ? '' : 'justify-center px-2'
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {showExpanded ? <span className="text-sm font-medium">Logout</span> : null}
          </button>
        </div>
      </aside>

      <div className={`min-h-screen transition-[margin] duration-300 ${contentMarginClass}`}>
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-3 sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="inline-flex min-h-12 min-w-[5.5rem] items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm active:bg-gray-100"
          >
            <Menu size={22} strokeWidth={2.25} />
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-gray-900">Salon POS</h2>
            <p className="truncate text-xs capitalize text-gray-500">{currentRole} panel</p>
          </div>
        </div>
        <div className="min-w-0 overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Confirm logout"
        description="Are you sure you want to sign out of Salon POS?"
        confirmLabel="Logout"
        cancelLabel="Stay signed in"
        destructive
        loading={logoutLoading}
        onCancel={() => !logoutLoading && setLogoutOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
