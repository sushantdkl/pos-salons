'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { canAccessPath, dashboardPathForRole, normalizeRole } from '@/constants/roles';
import { flattenNavigation, NAV_TINTS, navigationForRole, resolveActiveHref, tileFor } from '@/constants/navigation';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const SIDEBAR_SCROLL_KEY = 'salon_pos_sidebar_scroll';
const NAV_GROUPS_KEY = 'salon_pos_nav_groups';
const DESKTOP_MQ = '(min-width: 1024px)';
let authInitialized = false;

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(DESKTOP_MQ).matches;
}

function readSavedGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_GROUPS_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
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
  // Group open state. Starts empty on the server and the first client paint (no hydration
  // mismatch); saved state is restored in an effect and the active page's group is forced open.
  const [openGroups, setOpenGroups] = useState({});
  // Delegated HR permissions (Staff Permissions) reveal extra links for non-admin roles.
  const [grants, setGrants] = useState(null);

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

  useEffect(() => {
    // Restore saved groups, then make sure the group holding the current page is open.
    const entries = navigationForRole(currentRole, grants);
    const active = resolveActiveHref(entries, pathname);
    const activeGroup = entries.find((entry) => entry.items?.some((item) => item.href === active));
    setOpenGroups((current) => ({
      ...readSavedGroups(),
      ...current,
      ...(activeGroup ? { [activeGroup.id]: true } : {}),
    }));
  }, [pathname, currentRole, grants]);

  useEffect(() => {
    if (!currentRole || currentRole === 'admin') return undefined;
    let alive = true;
    const token = localStorage.getItem('pos_token');
    fetch('/api/hrm/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive && data?.permissions) setGrants(data.permissions); })
      .catch(() => {});
    return () => { alive = false; };
  }, [currentRole]);

  const toggleGroup = (id) => {
    setOpenGroups((current) => {
      const next = { ...current, [id]: !current[id] };
      try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

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

  const navEntries = navigationForRole(currentRole, grants);
  const activeHref = resolveActiveHref(navEntries, pathname);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5F2]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#DED3FB] border-t-[#6B46E5]" />
          <p className="text-[#7A736B]">Loading...</p>
        </div>
      </div>
    );
  }

  const showExpanded = isDesktop ? !desktopCollapsed : true;
  const desktopWidthClass = desktopCollapsed ? 'lg:w-20' : 'lg:w-64';
  const contentMarginClass = desktopCollapsed ? 'lg:ml-20' : 'lg:ml-64';

  const renderBrandMark = () => (
    <div className="relative flex h-9 w-9 flex-none overflow-hidden rounded-[10px] border border-[#ECE7E1] bg-white shadow-sm">
      <Image
        src="/assets/logo.jpg"
        alt="The Hair Cut POS logo"
        fill
        sizes="36px"
        className="object-cover"
        priority
      />
    </div>
  );

  /**
   * One nav link. Top-level links sit on white; group children sit on their family tint.
   * The active row is always the strongest element in the sidebar: tinted fill, bold label
   * and a solid left marker. In the collapsed rail the label becomes a native tooltip.
   */
  const renderNavLink = (item, tint, topLevel, iconOnly = false) => {
    const isActive = item.href === activeHref;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={iconOnly ? item.label : undefined}
        aria-label={iconOnly ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => {
          saveSidebarScroll();
          if (!isDesktopViewport()) closeMobileSidebar();
        }}
        className={`relative flex items-center gap-3 rounded-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/30 ${
          topLevel ? 'min-h-11 px-3 py-2.5' : 'min-h-10 px-3 py-2'
        } ${isActive ? `${tint.active} font-semibold` : `text-stone-700 ${topLevel ? 'hover:bg-stone-100' : 'hover:bg-white/70'}`} ${
          iconOnly ? 'justify-center px-2' : ''
        }`}
      >
        {isActive && !iconOnly ? (
          <span className={`absolute inset-y-2 left-0 w-[3px] rounded-full ${tint.bar}`} aria-hidden="true" />
        ) : null}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center ${topLevel ? tileFor(item) : tint.tile}`}
          aria-hidden="true"
        >
          <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        {iconOnly ? null : <span className={`truncate text-sm ${isActive ? '' : 'font-medium'}`}>{item.label}</span>}
      </Link>
    );
  };

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
        aria-hidden={!isDesktop && !sidebarOpen ? 'true' : undefined}
        inert={!isDesktop && !sidebarOpen ? true : undefined}
        className={`print-hide fixed inset-y-0 left-0 z-50 flex h-full w-[min(18rem,88vw)] flex-col border-r border-[#ECE7E1] bg-white transition-transform duration-300 ease-out lg:translate-x-0 ${desktopWidthClass} ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#F0ECE6] px-3 py-3.5 sm:px-4">
          {showExpanded ? (
            <div className="flex min-w-0 items-center gap-2.5">
              {renderBrandMark()}
              <div className="flex min-w-0 flex-col">
                <span
                  className="truncate text-[14px] font-extrabold text-[#1A1714]"
                  style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif', letterSpacing: '-.01em' }}
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
          aria-label="Main navigation"
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
        >
          {showExpanded
            ? navEntries.map((entry) => {
              if (!entry.items) {
                if (!entry.separatorBefore) return renderNavLink(entry, NAV_TINTS.top, true);
                return (
                  <div key={entry.href} className="space-y-1">
                    <div className="mx-2 border-t border-stone-200 pt-2" role="separator" aria-hidden="true" />
                    {renderNavLink(entry, NAV_TINTS.top, true)}
                  </div>
                );
              }
              const tint = NAV_TINTS[entry.tint] || NAV_TINTS.system;
              const hasActive = entry.items.some((item) => item.href === activeHref);
              const expanded = Boolean(openGroups[entry.id]) || hasActive;
              const panelId = `nav-group-${entry.id}`;
              return (
                <div key={entry.id} className={`rounded-xl ${tint.bg}`}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleGroup(entry.id)}
                    className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900/30 ${tint.header} ${tint.hover}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${tint.icon}`} aria-hidden="true"><entry.icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
                    <span className="flex-1">{entry.label}</span>
                    {hasActive && !expanded ? <span className={`h-1.5 w-1.5 rounded-full ${tint.bar}`} aria-hidden="true" /> : null}
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {expanded ? (
                    <div id={panelId} role="group" aria-label={entry.label} className="space-y-0.5 px-1.5 pb-1.5">
                      {entry.items.map((item) => renderNavLink(item, tint, false))}
                    </div>
                  ) : null}
                </div>
              );
            })
            : flattenNavigation(navEntries).map((item) => {
              const owner = navEntries.find((entry) => entry.items?.includes(item));
              return renderNavLink(item, NAV_TINTS[owner?.tint] || NAV_TINTS.top, true, true);
            })}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-[#F0ECE6] p-3">
          <button
            type="button"
            aria-label="Logout"
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

      <div className={`print-reset-offset min-h-screen min-w-0 transition-[margin] duration-300 ${contentMarginClass}`}>
        <div className="print-hide sticky top-0 z-30 flex items-center gap-3 border-b border-[#ECE7E1] bg-white px-3 py-3 sm:px-4 lg:hidden">
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
            {renderBrandMark()}
            <div className="min-w-0">
              <h2
                className="truncate text-[15px] font-extrabold text-[#1A1714]"
                style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif', letterSpacing: '-.01em' }}
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
