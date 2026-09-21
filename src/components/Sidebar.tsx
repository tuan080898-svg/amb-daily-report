'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/lib/store';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    icon: '📊',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'employee'] },
      { href: '/planning', label: 'Kế hoạch tháng', icon: '🎯', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'reports',
    label: 'Báo cáo',
    icon: '📝',
    items: [
      { href: '/reports', label: 'Nhập báo cáo', icon: '📝', roles: ['admin', 'employee'] },
      { href: '/reports/history', label: 'Lịch sử', icon: '📋', roles: ['admin', 'employee'] },
      { href: '/reports/sku', label: 'SP bán chạy', icon: '🏆', roles: ['admin', 'employee'] },
      { href: '/reports/analytics', label: 'Phân tích', icon: '📈', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'cskh',
    label: 'CSKH',
    icon: '🛡️',
    items: [
      { href: '/cskh', label: 'Dashboard', icon: '🛡️', roles: ['admin', 'employee'] },
      { href: '/cskh/report', label: 'Báo cáo', icon: '📞', roles: ['admin', 'employee'] },
      { href: '/checklist', label: 'Checklist', icon: '✅', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'admin',
    label: 'Quản trị',
    icon: '⚙️',
    items: [
      { href: '/admin/pnl', label: 'Lãi lỗ (PnL)', icon: '💹', roles: ['admin'] },
      { href: '/admin/sku', label: 'Quản lý SKU', icon: '🏷️', roles: ['admin'] },
      { href: '/admin/inventory', label: 'Kho', icon: '📦', roles: ['admin'] },
      { href: '/admin/shops', label: 'Shop', icon: '🏪', roles: ['admin'] },
      { href: '/admin/targets', label: 'KPI tháng', icon: '💰', roles: ['admin'] },
      { href: '/admin/users', label: 'User', icon: '👥', roles: ['admin'] },
      { href: '/admin/config', label: 'Cấu hình', icon: '⚙️', roles: ['admin'] },
    ],
  },
];

const BOTTOM_TABS = [
  { href: '/dashboard', label: 'Tổng quan', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/reports', label: 'Báo cáo', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/cskh', label: 'CSKH', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { href: '/admin/inventory', label: 'Kho', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', adminOnly: true },
];

function isItemActive(pathname: string, href: string): boolean {
  if (href === '/reports') return pathname === '/reports';
  if (href === '/cskh') return pathname === '/cskh';
  return pathname === href || pathname.startsWith(href + '/');
}

function getActiveGroup(pathname: string, groups: NavGroup[]): string | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (isItemActive(pathname, item.href)) return g.key;
    }
  }
  return null;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { currentUser } = useAppState();
  if (!currentUser) return null;

  var tabs = BOTTOM_TABS.filter(function(t) {
    if ((t as { adminOnly?: boolean }).adminOnly && currentUser.role !== 'admin') return false;
    return true;
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700/50 z-50 safe-bottom">
      <div className="flex items-center justify-around px-1 py-1">
        {tabs.map(function(tab) {
          var active = isItemActive(pathname, tab.href);
          return (
            <Link key={tab.href} href={tab.href}
              className={'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg min-w-0 flex-1 transition-colors ' + (active ? 'text-blue-400' : 'text-gray-500')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="text-[10px] font-medium truncate">{tab.label}</span>
            </Link>
          );
        })}
        <MobileMenuButton />
      </div>
    </nav>
  );
}

function MobileMenuButton() {
  const { currentUser } = useAppState();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(function() { setOpen(false); }, [pathname]);

  if (!currentUser) return null;

  var visibleGroups = NAV_GROUPS.map(function (g) {
    var items = g.items.filter(function (item) { return item.roles.includes(currentUser.role); });
    return items.length > 0 ? { ...g, items: items } : null;
  }).filter(Boolean) as NavGroup[];

  return (
    <>
      <button onClick={function() { setOpen(true); }}
        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-500 min-w-0 flex-1">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="text-[10px] font-medium">Menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" onClick={function() { setOpen(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-2xl max-h-[80vh] overflow-y-auto pb-8"
            onClick={function(e) { e.stopPropagation(); }}>
            <div className="flex items-center justify-center py-2">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>
            <div className="px-4 pb-3 border-b border-slate-700/50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                {currentUser.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">{currentUser.name}</p>
                <p className="text-xs text-gray-500">{currentUser.email}</p>
              </div>
            </div>

            <div className="p-3 space-y-1">
              {visibleGroups.map(function(g) {
                return (
                  <div key={g.key} className="mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-3 py-1">{g.icon} {g.label}</p>
                    {g.items.map(function(item) {
                      var active = isItemActive(pathname, item.href);
                      return (
                        <Link key={item.href} href={item.href} onClick={function() { setOpen(false); }}
                          className={'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ' + (active ? 'bg-blue-500/15 text-blue-400 font-medium' : 'text-gray-300 active:bg-slate-800')}>
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="px-4 pt-2 border-t border-slate-700/50">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LogoutButton() {
  const { logout } = useAppState();
  return (
    <button onClick={logout}
      className="w-full px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-left">
      Đăng xuất
    </button>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser, logout } = useAppState();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(function () {
    const active = getActiveGroup(pathname, NAV_GROUPS);
    if (active) {
      setExpanded(function (prev) {
        if (prev[active]) return prev;
        return { ...prev, [active]: true };
      });
    }
  }, [pathname]);

  if (!currentUser) return null;

  const visibleGroups = NAV_GROUPS.map(function (g) {
    const items = g.items.filter(function (item) { return item.roles.includes(currentUser.role); });
    return items.length > 0 ? { ...g, items: items } : null;
  }).filter(Boolean) as NavGroup[];

  function toggleGroup(key: string) {
    setExpanded(function (prev) { return { ...prev, [key]: !prev[key] }; });
  }

  if (collapsed) {
    return (
      <aside className="hidden md:flex w-16 bg-slate-900 border-r border-slate-700/50 flex-col min-h-screen">
        <div className="p-3 border-b border-slate-700/50 flex justify-center">
          <button onClick={function () { setCollapsed(false); }}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-gray-400 transition-colors" title="Mở rộng menu">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {visibleGroups.map(function (g) {
            const hasActive = g.items.some(function (item) { return isItemActive(pathname, item.href); });
            return (
              <Link key={g.key} href={g.items[0].href}
                className={'flex items-center justify-center p-2.5 rounded-lg text-lg transition-colors ' + (hasActive ? 'bg-blue-500/15' : 'hover:bg-slate-800')}
                title={g.label}>
                {g.icon}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700/50 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold cursor-pointer"
            title={currentUser.name}>
            {currentUser.name.charAt(0)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex w-60 bg-slate-900 border-r border-slate-700/50 flex-col min-h-screen">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-blue-400 leading-tight">AMB Daily Report</h1>
          <p className="text-[10px] text-gray-500">Báo cáo doanh số hàng ngày</p>
        </div>
        <button onClick={function () { setCollapsed(true); }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-gray-400 transition-colors" title="Thu gọn menu">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {visibleGroups.map(function (g) {
          const isOpen = !!expanded[g.key];
          const hasActive = g.items.some(function (item) { return isItemActive(pathname, item.href); });
          return (
            <div key={g.key}>
              <button onClick={function () { toggleGroup(g.key); }}
                className={'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ' + (hasActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/50')}>
                <span className="text-sm">{g.icon}</span>
                <span className="flex-1 text-left">{g.label}</span>
                <svg className={'w-3.5 h-3.5 transition-transform ' + (isOpen ? 'rotate-90' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isOpen && (
                <div className="ml-3 pl-3 border-l border-slate-700/40 space-y-0.5 mt-0.5 mb-1">
                  {g.items.map(function (item) {
                    const active = isItemActive(pathname, item.href);
                    return (
                      <Link key={item.href} href={item.href}
                        className={'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ' + (
                          active ? 'bg-blue-500/15 text-blue-400 font-medium' : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
                        )}>
                        <span className="text-xs">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{currentUser.name}</p>
            <p className="text-[10px] text-gray-500 truncate">{currentUser.email}</p>
          </div>
        </div>
        <button onClick={logout}
          className="w-full px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left">
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
