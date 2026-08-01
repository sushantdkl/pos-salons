'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Users, FileText, Settings, DollarSign, ReceiptText,
  LogOut, Menu, X, LayoutDashboard, Warehouse, Scissors, MessageCircle, Globe, PiggyBank
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

function isNavigationItemActive(pathname, href, isDashboard = false) {
  if (isDashboard) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const [userName, setUserName] = useState('');
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
    setUserName(user.full_name || user.username || '');
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
    { roles: ['admin'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/admin', color: 'text-gray-600', isDashboard: true },
    { roles: ['cashier'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/cashier', color: 'text-gray-600', isDashboard: true },
    { roles: ['barber'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/barber', color: 'text-gray-600', isDashboard: true },
    { roles: ['stylist'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/stylist', color: 'text-gray-600', isDashboard: true },
    { roles: ['beautician'], icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard/beautician', color: 'text-gray-600', isDashboard: true },
    { roles: ['admin'], icon: Scissors, label: 'Tokens', href: '/dashboard/admin/tokens', color: 'text-amber-700' },
    { roles: ['cashier'], icon: Scissors, label: 'Tokens', href: '/dashboard/cashier/tokens', color: 'text-amber-700' },
    { roles: ['barber'], icon: Scissors, label: 'Queue', href: '/dashboard/barber/queue', color: 'text-amber-700' },
    { roles: ['stylist'], icon: Scissors, label: 'Queue', href: '/dashboard/stylist/queue', color: 'text-amber-700' },
    { roles: ['beautician'], icon: Scissors, label: 'Queue', href: '/dashboard/beautician/queue', color: 'text-amber-700' },
    { roles: ['admin', 'cashier'], icon: DollarSign, label: 'Billing', href: '/admin/billing', color: 'text-teal-600' },
    { roles: ['cashier'], icon: ReceiptText, label: 'Daily Expenses', href: '/dashboard/cashier/daily-expenses', color: 'text-emerald-700' },
    { roles: ['cashier'], icon: PiggyBank, label: 'Savings', href: '/dashboard/cashier/savings', color: 'text-emerald-700' },
    { roles: ['admin', 'cashier'], icon: Scissors, label: 'Services', href: '/admin/products', color: 'text-blue-600' },
    { roles: ['admin', 'cashier'], icon: Warehouse, label: 'Inventory', href: '/admin/stock', color: 'text-indigo-600' },
    { roles: ['admin'], icon: Users, label: 'Staff', href: '/admin/employees', color: 'text-green-600' },
    { roles: ['admin', 'cashier'], icon: Users, label: 'Customers', href: '/admin/customers', color: 'text-pink-600' },
    { roles: ['admin'], icon: FileText, label: 'Reports', href: '/admin/reports', color: 'text-purple-600' },
    { roles: ['admin'], icon: Users, label: 'Performance', href: '/dashboard/admin/staff-performance', color: 'text-amber-700' },
    { roles: ['admin'], icon: DollarSign, label: 'Expenses & Salary', href: '/dashboard/admin/expenses', color: 'text-emerald-700' },
    { roles: ['admin'], icon: PiggyBank, label: 'Savings', href: '/admin/savings', color: 'text-emerald-700' },
    { roles: ['admin'], icon: Globe, label: 'Website CMS', href: '/dashboard/admin/website', color: 'text-blue-700' },
    { roles: ['admin', 'cashier'], icon: MessageCircle, label: 'Reminders', href: '/admin/reminders', color: 'text-green-600' },
    { roles: ['admin'], icon: Settings, label: 'Settings', href: '/admin/settings', color: 'text-gray-600' },
  ];
  const menuItems = allMenuItems.filter((item) => !item.roles || item.roles.includes(currentRole));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-4 border-[#6B46E5]" />
          <p className="text-[#7A736B]">Loading...</p>
        </div>
      </div>
    );
  }

  const showExpanded = isDesktop ? !desktopCollapsed : true;
  const desktopWidthClass = desktopCollapsed ? 'lg:w-20' : 'lg:w-64';
  const contentMarginClass = desktopCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  const brandMark = (
    <div
      className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#6B46E5] text-white"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif", fontWeight: 800, fontSize: 13 }}
    >
      H
    </div>
  );
  const userInitial = (userName || currentRole || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[min(18rem,88vw)] flex-col border-r border-[#ECE7E1] bg-white transition-transform duration-300 ease-out lg:translate-x-0 ${desktopWidthClass} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F0ECE6] px-3 py-3.5 sm:px-4">
          {showExpanded ? (
            <div className="flex min-w-0 items-center gap-2.5">
              {brandMark}
              <div className="flex min-w-0 flex-col">
                <span
                  className="truncate text-[14px] font-extrabold text-[#1A1714]"
                  style={{ fontFamily: "'Manrope', system-ui, sans-serif", letterSpacing: '-.01em' }}
                >
                  The Hair Cut POS
                </span>
                <span className="text-[10px] uppercase tracking-[.06em] text-[#9A938B]">Point of sale</span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={showExpanded ? 'Collapse menu' : 'Expand menu'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#5C554D] transition-colors hover:bg-[#F5F2EE]"
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
            const isActive = isNavigationItemActive(pathname, item.href, item.isDashboard);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  saveSidebarScroll();
                  if (!isDesktopViewport()) closeMobileSidebar();
                }}
                className={`flex min-h-11 items-center gap-3 rounded-[10px] border-l-[3px] px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#6B46E5]/25 ${
                  isActive ? 'border-[#17140f] bg-[#f3f1ec]' : 'border-transparent hover:bg-[#f5f2ee]'
                } ${showExpanded ? '' : 'justify-center px-2'}`}
              >
                {/* Colorful per-item icon (item.color); the active row goes dark/neutral. */}
                <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[#17140f]' : item.color}`} />
                {showExpanded ? (
                  <span className={`truncate text-sm ${isActive ? 'font-semibold text-[#17140f]' : 'font-medium text-[#3a342d]'}`}>
                    {item.label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-[#F0ECE6] p-3">
          {showExpanded ? (
            <div className="flex items-center gap-2.5 rounded-[10px] bg-[#FAF8F5] px-2.5 py-2">
              <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#DED3FB] text-[#5433C9]"
                style={{ fontFamily: "'Manrope', system-ui, sans-serif", fontWeight: 700, fontSize: 12 }}
              >
                {userInitial}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] font-semibold text-[#1A1714]">{userName || 'Signed in'}</span>
                <span className="text-[11px] capitalize text-[#8A837B]">{currentRole}</span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[#8A837B] transition-colors hover:bg-[#FDF2F1] hover:text-[#B23A2E] ${
              showExpanded ? '' : 'justify-center px-2'
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {showExpanded ? <span className="text-sm font-medium">Logout</span> : null}
          </button>
        </div>
      </aside>

      <div className={`min-h-screen min-w-0 transition-[margin] duration-300 ${contentMarginClass}`}>
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#ECE7E1] bg-white px-3 py-3 sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open menu"
            className="inline-flex min-h-12 min-w-[5.5rem] items-center justify-center gap-2 rounded-xl border border-[#E4DED6] bg-white px-3 text-sm font-semibold text-[#3A342D] shadow-sm active:bg-[#F5F2EE]"
          >
            <Menu size={22} strokeWidth={2.25} />
            Menu
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {brandMark}
            <div className="min-w-0">
              <h2
                className="truncate text-[15px] font-extrabold text-[#1A1714]"
                style={{ fontFamily: "'Manrope', system-ui, sans-serif", letterSpacing: '-.01em' }}
              >
                The Hair Cut POS
              </h2>
              <p className="truncate text-xs capitalize text-[#8A837B]">{currentRole} panel</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="Confirm logout"
        description="Are you sure you want to sign out of The Hair Cut Pos?"
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
